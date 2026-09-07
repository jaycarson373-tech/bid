use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self, Mint, TokenAccount, TokenInterface, TransferChecked};

declare_id!("E86s7fVfuaufjfwbKG6Nm7p8kNYStUrCFKkQH5kyubs4");

const BPS_DENOMINATOR: u128 = 10_000;
const MAX_UTILIZATION_SLOPE_BPS: u16 = 20_000;
const MAX_SETTLEMENT_WINDOW_SECONDS: i64 = 7 * 24 * 60 * 60;
const CLAIM_PERIOD_SECONDS: i64 = 30 * 24 * 60 * 60;

#[program]
pub mod hood_options {
    use super::*;

    pub fn initialize_protocol(
        ctx: Context<InitializeProtocol>,
        oracle_authority: Pubkey,
    ) -> Result<()> {
        let config = &mut ctx.accounts.config;
        config.authority = ctx.accounts.authority.key();
        config.oracle_authority = oracle_authority;
        config.collateral_mint = ctx.accounts.collateral_mint.key();
        config.collateral_decimals = ctx.accounts.collateral_mint.decimals;
        config.paused = true;
        config.bump = ctx.bumps.config;

        let vault = &mut ctx.accounts.vault;
        vault.config = config.key();
        vault.total_assets = 0;
        vault.total_shares = 0;
        vault.locked_collateral = 0;
        vault.bump = ctx.bumps.vault;
        Ok(())
    }

    pub fn set_paused(ctx: Context<AdminConfig>, paused: bool) -> Result<()> {
        ctx.accounts.config.paused = paused;
        Ok(())
    }

    pub fn initialize_lp_position(ctx: Context<InitializeLpPosition>) -> Result<()> {
        let position = &mut ctx.accounts.lp_position;
        position.owner = ctx.accounts.owner.key();
        position.vault = ctx.accounts.vault.key();
        position.shares = 0;
        position.bump = ctx.bumps.lp_position;
        Ok(())
    }

    pub fn deposit_liquidity(ctx: Context<DepositLiquidity>, amount: u64) -> Result<()> {
        require!(amount > 0, OptionsError::ZeroAmount);
        require!(!ctx.accounts.config.paused, OptionsError::ProtocolPaused);

        let vault = &mut ctx.accounts.vault;
        let shares = calculate_deposit_shares(amount, vault.total_assets, vault.total_shares)?;
        require!(shares > 0, OptionsError::ZeroShares);

        token_interface::transfer_checked(
            CpiContext::new(
                ctx.accounts.token_program.key(),
                TransferChecked {
                    from: ctx.accounts.owner_collateral.to_account_info(),
                    mint: ctx.accounts.collateral_mint.to_account_info(),
                    to: ctx.accounts.vault_collateral.to_account_info(),
                    authority: ctx.accounts.owner.to_account_info(),
                },
            ),
            amount,
            ctx.accounts.config.collateral_decimals,
        )?;

        vault.total_assets = checked_add(vault.total_assets, amount)?;
        vault.total_shares = checked_add(vault.total_shares, shares)?;
        ctx.accounts.lp_position.shares = checked_add(ctx.accounts.lp_position.shares, shares)?;
        emit!(LiquidityDeposited {
            owner: ctx.accounts.owner.key(),
            amount,
            shares
        });
        Ok(())
    }

    pub fn withdraw_liquidity(ctx: Context<WithdrawLiquidity>, shares: u64) -> Result<()> {
        require!(shares > 0, OptionsError::ZeroAmount);
        require!(
            ctx.accounts.vault.locked_collateral == 0,
            OptionsError::OutstandingLiabilities
        );
        require!(
            shares <= ctx.accounts.lp_position.shares,
            OptionsError::InsufficientShares
        );

        let amount = calculate_withdraw_assets(
            shares,
            ctx.accounts.vault.total_assets,
            ctx.accounts.vault.total_shares,
        )?;
        let bump = [ctx.accounts.config.bump];
        let signer_seeds: &[&[u8]] = &[b"config", &bump];

        token_interface::transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.key(),
                TransferChecked {
                    from: ctx.accounts.vault_collateral.to_account_info(),
                    mint: ctx.accounts.collateral_mint.to_account_info(),
                    to: ctx.accounts.owner_collateral.to_account_info(),
                    authority: ctx.accounts.config.to_account_info(),
                },
                &[signer_seeds],
            ),
            amount,
            ctx.accounts.config.collateral_decimals,
        )?;

        ctx.accounts.vault.total_assets = checked_sub(ctx.accounts.vault.total_assets, amount)?;
        ctx.accounts.vault.total_shares = checked_sub(ctx.accounts.vault.total_shares, shares)?;
        ctx.accounts.lp_position.shares = checked_sub(ctx.accounts.lp_position.shares, shares)?;
        emit!(LiquidityWithdrawn {
            owner: ctx.accounts.owner.key(),
            amount,
            shares
        });
        Ok(())
    }

    pub fn create_series(ctx: Context<CreateSeries>, params: CreateSeriesParams) -> Result<()> {
        require!(
            params.upper_strike_e6 > params.lower_strike_e6,
            OptionsError::InvalidStrikes
        );
        require!(
            params.expiry > Clock::get()?.unix_timestamp,
            OptionsError::InvalidExpiry
        );
        require!(
            params.settlement_window_seconds > 0
                && params.settlement_window_seconds <= MAX_SETTLEMENT_WINDOW_SECONDS,
            OptionsError::InvalidSettlementWindow
        );
        require!(params.max_payout_per_contract > 0, OptionsError::ZeroAmount);
        require!(
            params.base_premium_per_contract > 0
                && params.base_premium_per_contract < params.max_payout_per_contract,
            OptionsError::InvalidPremium
        );
        require!(
            params.utilization_slope_bps <= MAX_UTILIZATION_SLOPE_BPS,
            OptionsError::InvalidUtilizationSlope
        );

        let series = &mut ctx.accounts.series;
        series.config = ctx.accounts.config.key();
        series.vault = ctx.accounts.vault.key();
        series.id = params.id;
        series.option_type = params.option_type;
        series.lower_strike_e6 = params.lower_strike_e6;
        series.upper_strike_e6 = params.upper_strike_e6;
        series.expiry = params.expiry;
        series.settlement_window_seconds = params.settlement_window_seconds;
        series.max_payout_per_contract = params.max_payout_per_contract;
        series.base_premium_per_contract = params.base_premium_per_contract;
        series.utilization_slope_bps = params.utilization_slope_bps;
        series.open_interest = 0;
        series.locked_collateral = 0;
        series.total_premium = 0;
        series.settlement_price_e6 = 0;
        series.settled_at = 0;
        series.settled = false;
        series.bump = ctx.bumps.series;
        emit!(SeriesCreated {
            series: series.key(),
            id: params.id,
            expiry: params.expiry
        });
        Ok(())
    }

    pub fn initialize_option_position(ctx: Context<InitializeOptionPosition>) -> Result<()> {
        let position = &mut ctx.accounts.option_position;
        position.owner = ctx.accounts.owner.key();
        position.series = ctx.accounts.series.key();
        position.contracts = 0;
        position.premium_paid = 0;
        position.redeemed = false;
        position.bump = ctx.bumps.option_position;
        Ok(())
    }

    pub fn buy_options(
        ctx: Context<BuyOptions>,
        contracts: u64,
        max_total_premium: u64,
    ) -> Result<()> {
        require!(contracts > 0, OptionsError::ZeroAmount);
        require!(!ctx.accounts.config.paused, OptionsError::ProtocolPaused);
        require!(!ctx.accounts.series.settled, OptionsError::SeriesSettled);
        require!(
            Clock::get()?.unix_timestamp < ctx.accounts.series.expiry,
            OptionsError::SeriesExpired
        );
        require!(
            !ctx.accounts.option_position.redeemed,
            OptionsError::PositionRedeemed
        );

        let liability = checked_mul(ctx.accounts.series.max_payout_per_contract, contracts)?;
        let available = checked_sub(
            ctx.accounts.vault.total_assets,
            ctx.accounts.vault.locked_collateral,
        )?;
        require!(
            available >= liability,
            OptionsError::InsufficientVaultLiquidity
        );

        let premium_per_contract = utilization_quote(
            ctx.accounts.series.base_premium_per_contract,
            ctx.accounts.vault.locked_collateral,
            ctx.accounts.vault.total_assets,
            ctx.accounts.series.utilization_slope_bps,
        )?;
        let total_premium = checked_mul(premium_per_contract, contracts)?;
        require!(
            total_premium <= max_total_premium,
            OptionsError::PremiumSlippageExceeded
        );

        token_interface::transfer_checked(
            CpiContext::new(
                ctx.accounts.token_program.key(),
                TransferChecked {
                    from: ctx.accounts.buyer_collateral.to_account_info(),
                    mint: ctx.accounts.collateral_mint.to_account_info(),
                    to: ctx.accounts.vault_collateral.to_account_info(),
                    authority: ctx.accounts.buyer.to_account_info(),
                },
            ),
            total_premium,
            ctx.accounts.config.collateral_decimals,
        )?;

        ctx.accounts.vault.total_assets =
            checked_add(ctx.accounts.vault.total_assets, total_premium)?;
        ctx.accounts.vault.locked_collateral =
            checked_add(ctx.accounts.vault.locked_collateral, liability)?;
        ctx.accounts.series.open_interest =
            checked_add(ctx.accounts.series.open_interest, contracts)?;
        ctx.accounts.series.locked_collateral =
            checked_add(ctx.accounts.series.locked_collateral, liability)?;
        ctx.accounts.series.total_premium =
            checked_add(ctx.accounts.series.total_premium, total_premium)?;
        ctx.accounts.option_position.contracts =
            checked_add(ctx.accounts.option_position.contracts, contracts)?;
        ctx.accounts.option_position.premium_paid =
            checked_add(ctx.accounts.option_position.premium_paid, total_premium)?;
        emit!(OptionsPurchased {
            buyer: ctx.accounts.buyer.key(),
            series: ctx.accounts.series.key(),
            contracts,
            total_premium,
            liability
        });
        Ok(())
    }

    pub fn settle_series(
        ctx: Context<SettleSeries>,
        settlement_price_e6: u64,
        observed_at: i64,
    ) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let series = &mut ctx.accounts.series;
        require!(!series.settled, OptionsError::SeriesSettled);
        require!(now >= series.expiry, OptionsError::SeriesNotExpired);
        require!(
            observed_at >= series.expiry
                && observed_at <= series.expiry + series.settlement_window_seconds,
            OptionsError::InvalidOracleObservation
        );
        require!(settlement_price_e6 > 0, OptionsError::InvalidOraclePrice);
        series.settlement_price_e6 = settlement_price_e6;
        series.settled_at = now;
        series.settled = true;
        emit!(SeriesSettled {
            series: series.key(),
            settlement_price_e6,
            observed_at
        });
        Ok(())
    }

    pub fn redeem(ctx: Context<Redeem>) -> Result<()> {
        require!(ctx.accounts.series.settled, OptionsError::SeriesNotSettled);
        require!(
            !ctx.accounts.option_position.redeemed,
            OptionsError::PositionRedeemed
        );
        require!(
            ctx.accounts.option_position.contracts > 0,
            OptionsError::EmptyPosition
        );
        require!(
            Clock::get()?.unix_timestamp <= ctx.accounts.series.settled_at + CLAIM_PERIOD_SECONDS,
            OptionsError::ClaimPeriodClosed
        );

        let max_liability = checked_mul(
            ctx.accounts.series.max_payout_per_contract,
            ctx.accounts.option_position.contracts,
        )?;
        let payout_per_contract = payout_per_contract(&ctx.accounts.series)?;
        let payout = checked_mul(payout_per_contract, ctx.accounts.option_position.contracts)?;
        require!(payout <= max_liability, OptionsError::InvariantViolation);

        if payout > 0 {
            let bump = [ctx.accounts.config.bump];
            let signer_seeds: &[&[u8]] = &[b"config", &bump];
            token_interface::transfer_checked(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.key(),
                    TransferChecked {
                        from: ctx.accounts.vault_collateral.to_account_info(),
                        mint: ctx.accounts.collateral_mint.to_account_info(),
                        to: ctx.accounts.owner_collateral.to_account_info(),
                        authority: ctx.accounts.config.to_account_info(),
                    },
                    &[signer_seeds],
                ),
                payout,
                ctx.accounts.config.collateral_decimals,
            )?;
            ctx.accounts.vault.total_assets = checked_sub(ctx.accounts.vault.total_assets, payout)?;
        }

        ctx.accounts.vault.locked_collateral =
            checked_sub(ctx.accounts.vault.locked_collateral, max_liability)?;
        ctx.accounts.series.locked_collateral =
            checked_sub(ctx.accounts.series.locked_collateral, max_liability)?;
        ctx.accounts.option_position.redeemed = true;
        emit!(PositionRedeemed {
            owner: ctx.accounts.owner.key(),
            series: ctx.accounts.series.key(),
            payout,
            released_collateral: max_liability
        });
        Ok(())
    }

    pub fn expire_unclaimed_position(ctx: Context<ExpireUnclaimedPosition>) -> Result<()> {
        require!(ctx.accounts.series.settled, OptionsError::SeriesNotSettled);
        require!(
            !ctx.accounts.option_position.redeemed,
            OptionsError::PositionRedeemed
        );
        require!(
            Clock::get()?.unix_timestamp > ctx.accounts.series.settled_at + CLAIM_PERIOD_SECONDS,
            OptionsError::ClaimPeriodOpen
        );

        let released_collateral = checked_mul(
            ctx.accounts.series.max_payout_per_contract,
            ctx.accounts.option_position.contracts,
        )?;
        ctx.accounts.vault.locked_collateral =
            checked_sub(ctx.accounts.vault.locked_collateral, released_collateral)?;
        ctx.accounts.series.locked_collateral =
            checked_sub(ctx.accounts.series.locked_collateral, released_collateral)?;
        ctx.accounts.option_position.redeemed = true;
        emit!(PositionExpired {
            owner: ctx.accounts.option_position.owner,
            series: ctx.accounts.series.key(),
            released_collateral
        });
        Ok(())
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, InitSpace)]
pub struct CreateSeriesParams {
    pub id: u64,
    pub option_type: OptionType,
    pub lower_strike_e6: u64,
    pub upper_strike_e6: u64,
    pub expiry: i64,
    pub settlement_window_seconds: i64,
    pub max_payout_per_contract: u64,
    pub base_premium_per_contract: u64,
    pub utilization_slope_bps: u16,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum OptionType {
    CallSpread,
    PutSpread,
}

#[account]
#[derive(InitSpace)]
pub struct ProtocolConfig {
    pub authority: Pubkey,
    pub oracle_authority: Pubkey,
    pub collateral_mint: Pubkey,
    pub collateral_decimals: u8,
    pub paused: bool,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Vault {
    pub config: Pubkey,
    pub total_assets: u64,
    pub total_shares: u64,
    pub locked_collateral: u64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct LpPosition {
    pub owner: Pubkey,
    pub vault: Pubkey,
    pub shares: u64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Series {
    pub config: Pubkey,
    pub vault: Pubkey,
    pub id: u64,
    pub option_type: OptionType,
    pub lower_strike_e6: u64,
    pub upper_strike_e6: u64,
    pub expiry: i64,
    pub settlement_window_seconds: i64,
    pub max_payout_per_contract: u64,
    pub base_premium_per_contract: u64,
    pub utilization_slope_bps: u16,
    pub open_interest: u64,
    pub locked_collateral: u64,
    pub total_premium: u64,
    pub settlement_price_e6: u64,
    pub settled_at: i64,
    pub settled: bool,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct OptionPosition {
    pub owner: Pubkey,
    pub series: Pubkey,
    pub contracts: u64,
    pub premium_paid: u64,
    pub redeemed: bool,
    pub bump: u8,
}

#[derive(Accounts)]
pub struct InitializeProtocol<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(init, payer = authority, seeds = [b"config"], bump, space = 8 + ProtocolConfig::INIT_SPACE)]
    pub config: Account<'info, ProtocolConfig>,
    #[account(init, payer = authority, seeds = [b"vault", config.key().as_ref()], bump, space = 8 + Vault::INIT_SPACE)]
    pub vault: Account<'info, Vault>,
    pub collateral_mint: InterfaceAccount<'info, Mint>,
    #[account(init, payer = authority, seeds = [b"vault_collateral", config.key().as_ref()], bump, token::mint = collateral_mint, token::authority = config, token::token_program = token_program)]
    pub vault_collateral: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AdminConfig<'info> {
    pub authority: Signer<'info>,
    #[account(mut, seeds = [b"config"], bump = config.bump, has_one = authority)]
    pub config: Account<'info, ProtocolConfig>,
}

#[derive(Accounts)]
pub struct InitializeLpPosition<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, ProtocolConfig>,
    #[account(seeds = [b"vault", config.key().as_ref()], bump = vault.bump, has_one = config)]
    pub vault: Account<'info, Vault>,
    #[account(init, payer = owner, seeds = [b"lp", vault.key().as_ref(), owner.key().as_ref()], bump, space = 8 + LpPosition::INIT_SPACE)]
    pub lp_position: Account<'info, LpPosition>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct DepositLiquidity<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, ProtocolConfig>,
    #[account(mut, seeds = [b"vault", config.key().as_ref()], bump = vault.bump, has_one = config)]
    pub vault: Account<'info, Vault>,
    #[account(mut, seeds = [b"lp", vault.key().as_ref(), owner.key().as_ref()], bump = lp_position.bump, has_one = owner, has_one = vault)]
    pub lp_position: Account<'info, LpPosition>,
    #[account(address = config.collateral_mint)]
    pub collateral_mint: InterfaceAccount<'info, Mint>,
    #[account(mut, token::mint = collateral_mint, token::authority = owner, token::token_program = token_program)]
    pub owner_collateral: InterfaceAccount<'info, TokenAccount>,
    #[account(mut, seeds = [b"vault_collateral", config.key().as_ref()], bump, token::mint = collateral_mint, token::authority = config, token::token_program = token_program)]
    pub vault_collateral: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct WithdrawLiquidity<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, ProtocolConfig>,
    #[account(mut, seeds = [b"vault", config.key().as_ref()], bump = vault.bump, has_one = config)]
    pub vault: Account<'info, Vault>,
    #[account(mut, seeds = [b"lp", vault.key().as_ref(), owner.key().as_ref()], bump = lp_position.bump, has_one = owner, has_one = vault)]
    pub lp_position: Account<'info, LpPosition>,
    #[account(address = config.collateral_mint)]
    pub collateral_mint: InterfaceAccount<'info, Mint>,
    #[account(mut, token::mint = collateral_mint, token::authority = owner, token::token_program = token_program)]
    pub owner_collateral: InterfaceAccount<'info, TokenAccount>,
    #[account(mut, seeds = [b"vault_collateral", config.key().as_ref()], bump, token::mint = collateral_mint, token::authority = config, token::token_program = token_program)]
    pub vault_collateral: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
#[instruction(params: CreateSeriesParams)]
pub struct CreateSeries<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(seeds = [b"config"], bump = config.bump, has_one = authority)]
    pub config: Account<'info, ProtocolConfig>,
    #[account(seeds = [b"vault", config.key().as_ref()], bump = vault.bump, has_one = config)]
    pub vault: Account<'info, Vault>,
    #[account(init, payer = authority, seeds = [b"series", config.key().as_ref(), &params.id.to_le_bytes()], bump, space = 8 + Series::INIT_SPACE)]
    pub series: Account<'info, Series>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct InitializeOptionPosition<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, ProtocolConfig>,
    #[account(has_one = config)]
    pub series: Account<'info, Series>,
    #[account(init, payer = owner, seeds = [b"position", series.key().as_ref(), owner.key().as_ref()], bump, space = 8 + OptionPosition::INIT_SPACE)]
    pub option_position: Account<'info, OptionPosition>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct BuyOptions<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Box<Account<'info, ProtocolConfig>>,
    #[account(mut, seeds = [b"vault", config.key().as_ref()], bump = vault.bump, has_one = config)]
    pub vault: Box<Account<'info, Vault>>,
    #[account(mut, has_one = config, has_one = vault)]
    pub series: Box<Account<'info, Series>>,
    #[account(mut, seeds = [b"position", series.key().as_ref(), buyer.key().as_ref()], bump = option_position.bump, constraint = option_position.owner == buyer.key() @ OptionsError::InvalidPositionOwner, constraint = option_position.series == series.key() @ OptionsError::InvalidPositionSeries)]
    pub option_position: Box<Account<'info, OptionPosition>>,
    #[account(address = config.collateral_mint)]
    pub collateral_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut, token::mint = collateral_mint, token::authority = buyer, token::token_program = token_program)]
    pub buyer_collateral: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut, seeds = [b"vault_collateral", config.key().as_ref()], bump, token::mint = collateral_mint, token::authority = config, token::token_program = token_program)]
    pub vault_collateral: Box<InterfaceAccount<'info, TokenAccount>>,
    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct SettleSeries<'info> {
    pub oracle_authority: Signer<'info>,
    #[account(seeds = [b"config"], bump = config.bump, has_one = oracle_authority)]
    pub config: Account<'info, ProtocolConfig>,
    #[account(mut, has_one = config)]
    pub series: Account<'info, Series>,
}

#[derive(Accounts)]
pub struct Redeem<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Box<Account<'info, ProtocolConfig>>,
    #[account(mut, seeds = [b"vault", config.key().as_ref()], bump = vault.bump, has_one = config)]
    pub vault: Box<Account<'info, Vault>>,
    #[account(mut, has_one = config, has_one = vault)]
    pub series: Box<Account<'info, Series>>,
    #[account(mut, seeds = [b"position", series.key().as_ref(), owner.key().as_ref()], bump = option_position.bump, has_one = owner, has_one = series)]
    pub option_position: Box<Account<'info, OptionPosition>>,
    #[account(address = config.collateral_mint)]
    pub collateral_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut, token::mint = collateral_mint, token::authority = owner, token::token_program = token_program)]
    pub owner_collateral: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(mut, seeds = [b"vault_collateral", config.key().as_ref()], bump, token::mint = collateral_mint, token::authority = config, token::token_program = token_program)]
    pub vault_collateral: Box<InterfaceAccount<'info, TokenAccount>>,
    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct ExpireUnclaimedPosition<'info> {
    pub cranker: Signer<'info>,
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, ProtocolConfig>,
    #[account(mut, seeds = [b"vault", config.key().as_ref()], bump = vault.bump, has_one = config)]
    pub vault: Account<'info, Vault>,
    #[account(mut, has_one = config, has_one = vault)]
    pub series: Account<'info, Series>,
    #[account(mut, seeds = [b"position", series.key().as_ref(), option_position.owner.as_ref()], bump = option_position.bump, has_one = series)]
    pub option_position: Account<'info, OptionPosition>,
}

fn calculate_deposit_shares(amount: u64, total_assets: u64, total_shares: u64) -> Result<u64> {
    if total_shares == 0 {
        require!(total_assets == 0, OptionsError::InvariantViolation);
        return Ok(amount);
    }
    require!(total_assets > 0, OptionsError::InvariantViolation);
    u64::try_from(
        (amount as u128)
            .checked_mul(total_shares as u128)
            .ok_or(OptionsError::MathOverflow)?
            .checked_div(total_assets as u128)
            .ok_or(OptionsError::MathOverflow)?,
    )
    .map_err(|_| error!(OptionsError::MathOverflow))
}

fn calculate_withdraw_assets(shares: u64, total_assets: u64, total_shares: u64) -> Result<u64> {
    require!(total_shares > 0, OptionsError::InvariantViolation);
    u64::try_from(
        (shares as u128)
            .checked_mul(total_assets as u128)
            .ok_or(OptionsError::MathOverflow)?
            .checked_div(total_shares as u128)
            .ok_or(OptionsError::MathOverflow)?,
    )
    .map_err(|_| error!(OptionsError::MathOverflow))
}

fn utilization_quote(base: u64, locked: u64, assets: u64, slope_bps: u16) -> Result<u64> {
    require!(assets > 0, OptionsError::InsufficientVaultLiquidity);
    let utilization_bps = (locked as u128)
        .checked_mul(BPS_DENOMINATOR)
        .ok_or(OptionsError::MathOverflow)?
        .checked_div(assets as u128)
        .ok_or(OptionsError::MathOverflow)?
        .min(BPS_DENOMINATOR);
    let markup_bps = utilization_bps
        .checked_mul(slope_bps as u128)
        .ok_or(OptionsError::MathOverflow)?
        .checked_div(BPS_DENOMINATOR)
        .ok_or(OptionsError::MathOverflow)?;
    u64::try_from(
        (base as u128)
            .checked_mul(BPS_DENOMINATOR + markup_bps)
            .ok_or(OptionsError::MathOverflow)?
            .checked_div(BPS_DENOMINATOR)
            .ok_or(OptionsError::MathOverflow)?,
    )
    .map_err(|_| error!(OptionsError::MathOverflow))
}

fn payout_per_contract(series: &Series) -> Result<u64> {
    let width = checked_sub(series.upper_strike_e6, series.lower_strike_e6)?;
    let intrinsic = match series.option_type {
        OptionType::CallSpread => series
            .settlement_price_e6
            .saturating_sub(series.lower_strike_e6)
            .min(width),
        OptionType::PutSpread => series
            .upper_strike_e6
            .saturating_sub(series.settlement_price_e6)
            .min(width),
    };
    u64::try_from(
        (intrinsic as u128)
            .checked_mul(series.max_payout_per_contract as u128)
            .ok_or(OptionsError::MathOverflow)?
            .checked_div(width as u128)
            .ok_or(OptionsError::MathOverflow)?,
    )
    .map_err(|_| error!(OptionsError::MathOverflow))
}

fn checked_add(left: u64, right: u64) -> Result<u64> {
    left.checked_add(right)
        .ok_or_else(|| error!(OptionsError::MathOverflow))
}
fn checked_sub(left: u64, right: u64) -> Result<u64> {
    left.checked_sub(right)
        .ok_or_else(|| error!(OptionsError::MathOverflow))
}
fn checked_mul(left: u64, right: u64) -> Result<u64> {
    left.checked_mul(right)
        .ok_or_else(|| error!(OptionsError::MathOverflow))
}

#[event]
pub struct LiquidityDeposited {
    pub owner: Pubkey,
    pub amount: u64,
    pub shares: u64,
}
#[event]
pub struct LiquidityWithdrawn {
    pub owner: Pubkey,
    pub amount: u64,
    pub shares: u64,
}
#[event]
pub struct SeriesCreated {
    pub series: Pubkey,
    pub id: u64,
    pub expiry: i64,
}
#[event]
pub struct OptionsPurchased {
    pub buyer: Pubkey,
    pub series: Pubkey,
    pub contracts: u64,
    pub total_premium: u64,
    pub liability: u64,
}
#[event]
pub struct SeriesSettled {
    pub series: Pubkey,
    pub settlement_price_e6: u64,
    pub observed_at: i64,
}
#[event]
pub struct PositionRedeemed {
    pub owner: Pubkey,
    pub series: Pubkey,
    pub payout: u64,
    pub released_collateral: u64,
}
#[event]
pub struct PositionExpired {
    pub owner: Pubkey,
    pub series: Pubkey,
    pub released_collateral: u64,
}

#[error_code]
pub enum OptionsError {
    #[msg("Protocol is paused")]
    ProtocolPaused,
    #[msg("Amount must be greater than zero")]
    ZeroAmount,
    #[msg("Share calculation rounded to zero")]
    ZeroShares,
    #[msg("Arithmetic overflow or underflow")]
    MathOverflow,
    #[msg("Protocol accounting invariant failed")]
    InvariantViolation,
    #[msg("Vault has outstanding option liabilities")]
    OutstandingLiabilities,
    #[msg("Insufficient LP shares")]
    InsufficientShares,
    #[msg("Upper strike must exceed lower strike")]
    InvalidStrikes,
    #[msg("Expiry must be in the future")]
    InvalidExpiry,
    #[msg("Settlement window is invalid")]
    InvalidSettlementWindow,
    #[msg("Premium must be positive and below max payout")]
    InvalidPremium,
    #[msg("Utilization slope is too high")]
    InvalidUtilizationSlope,
    #[msg("Series is already settled")]
    SeriesSettled,
    #[msg("Series has expired")]
    SeriesExpired,
    #[msg("Series has not expired")]
    SeriesNotExpired,
    #[msg("Series is not settled")]
    SeriesNotSettled,
    #[msg("Vault cannot collateralize this order")]
    InsufficientVaultLiquidity,
    #[msg("Premium exceeded the user's maximum")]
    PremiumSlippageExceeded,
    #[msg("Oracle observation is outside the settlement window")]
    InvalidOracleObservation,
    #[msg("Oracle price is invalid")]
    InvalidOraclePrice,
    #[msg("Position owner does not match signer")]
    InvalidPositionOwner,
    #[msg("Position belongs to another series")]
    InvalidPositionSeries,
    #[msg("Position was already redeemed")]
    PositionRedeemed,
    #[msg("Position has no contracts")]
    EmptyPosition,
    #[msg("Claim period has closed")]
    ClaimPeriodClosed,
    #[msg("Claim period is still open")]
    ClaimPeriodOpen,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn series(option_type: OptionType, settlement_price_e6: u64) -> Series {
        Series {
            config: Pubkey::default(),
            vault: Pubkey::default(),
            id: 1,
            option_type,
            lower_strike_e6: 70_000_000,
            upper_strike_e6: 80_000_000,
            expiry: 0,
            settlement_window_seconds: 60,
            max_payout_per_contract: 10_000_000,
            base_premium_per_contract: 1_000_000,
            utilization_slope_bps: 5_000,
            open_interest: 0,
            locked_collateral: 0,
            total_premium: 0,
            settlement_price_e6,
            settled_at: 0,
            settled: true,
            bump: 0,
        }
    }

    #[test]
    fn call_payout_is_capped() {
        assert_eq!(
            payout_per_contract(&series(OptionType::CallSpread, 60_000_000)).unwrap(),
            0
        );
        assert_eq!(
            payout_per_contract(&series(OptionType::CallSpread, 75_000_000)).unwrap(),
            5_000_000
        );
        assert_eq!(
            payout_per_contract(&series(OptionType::CallSpread, 120_000_000)).unwrap(),
            10_000_000
        );
    }

    #[test]
    fn put_payout_is_capped() {
        assert_eq!(
            payout_per_contract(&series(OptionType::PutSpread, 90_000_000)).unwrap(),
            0
        );
        assert_eq!(
            payout_per_contract(&series(OptionType::PutSpread, 75_000_000)).unwrap(),
            5_000_000
        );
        assert_eq!(
            payout_per_contract(&series(OptionType::PutSpread, 10_000_000)).unwrap(),
            10_000_000
        );
    }

    #[test]
    fn utilization_increases_premium_deterministically() {
        assert_eq!(
            utilization_quote(1_000_000, 0, 10_000_000, 5_000).unwrap(),
            1_000_000
        );
        assert_eq!(
            utilization_quote(1_000_000, 5_000_000, 10_000_000, 5_000).unwrap(),
            1_250_000
        );
    }

    #[test]
    fn lp_share_round_trip_preserves_value_without_pnl() {
        let shares = calculate_deposit_shares(250_000_000, 1_000_000_000, 1_000_000_000).unwrap();
        assert_eq!(shares, 250_000_000);
        assert_eq!(
            calculate_withdraw_assets(shares, 1_250_000_000, 1_250_000_000).unwrap(),
            250_000_000
        );
    }
}
