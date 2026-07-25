export type LaunchState = "prelaunch" | "demo" | "live";

const launchStates: LaunchState[] = ["prelaunch", "demo", "live"];
const rawLaunchState = process.env.NEXT_PUBLIC_LAUNCH_STATE;

export const LAUNCH_STATE: LaunchState = launchStates.includes(rawLaunchState as LaunchState)
  ? (rawLaunchState as LaunchState)
  : "prelaunch";

export const isLive = LAUNCH_STATE === "live";
export const isDemo = LAUNCH_STATE === "demo";
export const isPrelaunch = LAUNCH_STATE === "prelaunch";
