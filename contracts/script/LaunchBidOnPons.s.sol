// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";

import {BidFeePolicy} from "../src/BidFeePolicy.sol";

interface IBidTreasuryFactoryBinding {
    function owner() external view returns (address);
    function ponsFactory() external view returns (address);
}

interface IPonsV2LaunchFactory {
    struct Socials {
        string twitter;
        string telegram;
        string discord;
        string website;
        string farcaster;
    }

    struct TokenParams {
        string name;
        string symbol;
        string logo;
        string description;
        Socials socials;
        address creatorFeeRecipient;
        uint16 creatorTaxBps;
        bool buybackEnabled;
        bytes32 expectedEconomics;
        bytes32 salt;
    }

    function approvedPairTokens(address pairToken) external view returns (bool);
    function canLaunch(address launcher) external view returns (bool);
    function launchFee() external view returns (uint256);
    function maxCreatorTaxBps() external view returns (uint16);
    function previewLaunchEconomics(uint256 launchConfigId, address pairToken) external view returns (bytes32);
    function launchToken(TokenParams calldata params, uint256 launchConfigId, address pairToken)
        external
        payable
        returns (address token, address curve);
}

contract LaunchBidOnPons is Script {
    uint16 private constant BID_CREATOR_TAX_BPS = BidFeePolicy.CREATOR_FEE_BPS;

    function run() external returns (address token, address curve) {
        uint256 expectedChainId = vm.envUint("BID_EXPECTED_CHAIN_ID");
        uint256 creatorKey = vm.envUint("PONS_CREATOR_PRIVATE_KEY");
        address deployer = vm.addr(creatorKey);
        address expectedCreator = vm.envOr("PONS_CREATOR_ADDRESS", address(0));
        if (expectedCreator != address(0)) require(expectedCreator == deployer, "Pons creator key mismatch");
        address treasury = vm.envAddress("BID_FLYWHEEL_TREASURY");
        address pairToken = vm.envAddress("PONS_QUOTE_ASSET");
        IPonsV2LaunchFactory factory = IPonsV2LaunchFactory(vm.envAddress("PONS_FACTORY"));
        uint256 launchConfigId = vm.envOr("PONS_LAUNCH_CONFIG_ID", uint256(0));

        _validateLaunch(expectedChainId, deployer, treasury, pairToken, factory);
        uint256 fee = factory.launchFee();
        IPonsV2LaunchFactory.TokenParams memory params = _tokenParams(factory, launchConfigId, pairToken, treasury);

        vm.startBroadcast(creatorKey);
        (token, curve) = factory.launchToken{value: fee}(params, launchConfigId, pairToken);
        vm.stopBroadcast();

        require(token.code.length > 0 && curve.code.length > 0, "Pons launch did not deploy code");
        console2.log("NEXT_PUBLIC_BID_CONTRACT_ADDRESS=%s", token);
        console2.log("BID_TOKEN_ADDRESS=%s", token);
        console2.log("PONS_CURVE_ADDRESS=%s", curve);
        console2.log("Pons launch fee paid=%s", fee);
    }

    function _validateLaunch(
        uint256 expectedChainId,
        address deployer,
        address treasury,
        address pairToken,
        IPonsV2LaunchFactory factory
    ) private view {
        require(block.chainid == expectedChainId && expectedChainId == 4663, "unexpected chain");
        require(deployer != address(0) && treasury.code.length > 0, "invalid deployer or treasury");
        require(address(factory).code.length > 0, "Pons factory has no code");
        require(
            IBidTreasuryFactoryBinding(treasury).ponsFactory() == address(factory), "treasury Pons factory mismatch"
        );
        require(pairToken.code.length > 0, "Pons pair token has no code");
        require(factory.approvedPairTokens(pairToken), "Pons pair token is not approved");
        require(factory.canLaunch(deployer), "deployer cannot launch on Pons");
        require(factory.maxCreatorTaxBps() >= BID_CREATOR_TAX_BPS, "Pons tax cap below 1.5%");
    }

    function _tokenParams(IPonsV2LaunchFactory factory, uint256 launchConfigId, address pairToken, address treasury)
        private
        view
        returns (IPonsV2LaunchFactory.TokenParams memory params)
    {
        string memory name = vm.envOr("BID_TOKEN_NAME", string("BID"));
        string memory symbol = vm.envOr("BID_TOKEN_SYMBOL", string("BID"));
        string memory logo = vm.envString("BID_TOKEN_LOGO_URI");
        string memory description = vm.envString("BID_TOKEN_DESCRIPTION");
        bytes32 salt = vm.envBytes32("BID_PONS_SALT");

        require(
            bytes(name).length > 0 && bytes(logo).length > 0 && bytes(description).length > 0, "token metadata missing"
        );
        require(keccak256(bytes(symbol)) == keccak256("BID"), "token symbol must be BID");
        require(salt != bytes32(0), "Pons salt must be nonzero");

        params = IPonsV2LaunchFactory.TokenParams({
            name: name,
            symbol: symbol,
            logo: logo,
            description: description,
            socials: IPonsV2LaunchFactory.Socials({
                twitter: vm.envOr("BID_SOCIAL_TWITTER", string("")),
                telegram: vm.envOr("BID_SOCIAL_TELEGRAM", string("")),
                discord: vm.envOr("BID_SOCIAL_DISCORD", string("")),
                website: vm.envOr("BID_SOCIAL_WEBSITE", string("")),
                farcaster: vm.envOr("BID_SOCIAL_FARCASTER", string(""))
            }),
            creatorFeeRecipient: treasury,
            creatorTaxBps: BID_CREATOR_TAX_BPS,
            buybackEnabled: false,
            expectedEconomics: factory.previewLaunchEconomics(launchConfigId, pairToken),
            salt: salt
        });
    }
}
