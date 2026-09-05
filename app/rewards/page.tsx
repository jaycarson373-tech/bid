import type { Metadata } from "next";
import RewardsClient from "./rewards-client";

export const metadata: Metadata = {
  title: "BID Rewards",
  description: "Verify and claim published BID prediction-market reward epochs.",
};

export default function RewardsPage() {
  return <RewardsClient />;
}
