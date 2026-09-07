import { createClient, mainnet } from "@solana/kit";
import { solanaRpc } from "@solana/kit-plugin-rpc";
import { walletSigner } from "@solana/kit-plugin-wallet";

const rpcUrl = mainnet(
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com",
);

export const solanaClient = createClient()
  .use(walletSigner({ chain: "solana:mainnet" }))
  .use(solanaRpc({ rpcUrl }));

export type SolanaClient = Awaited<typeof solanaClient>;
