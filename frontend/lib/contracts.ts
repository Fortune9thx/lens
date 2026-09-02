/**
 * Deployed LensFactory contract address, keyed by network. Populated by
 * deploy/001_deploy_lens_factory.ts after a real deployment -- undefined
 * until then, in which case the app surfaces an explicit "not deployed yet"
 * state rather than a silently broken read.
 */
export type LensNetworkKey = "bradbury" | "studio" | "asimov";

export const LENS_FACTORY_ADDRESSES: Record<LensNetworkKey, `0x${string}` | undefined> = {
  bradbury: "0xd691aD9d29bdE22755ce346883eBDCfB7ebF070e",
  studio: undefined,
  asimov: undefined,
};

export const LENS_ACTIVE_NETWORK: LensNetworkKey = "bradbury";

/**
 * Resolution order: an explicit env override (useful for pointing a local
 * dev build at a different deploy without editing this file) first, then
 * the address deploy/001_deploy_lens_factory.ts wrote here.
 */
export function getLensFactoryAddress(): `0x${string}` | undefined {
  const override = process.env.NEXT_PUBLIC_LENS_FACTORY_ADDRESS;
  return (override || LENS_FACTORY_ADDRESSES[LENS_ACTIVE_NETWORK]) as `0x${string}` | undefined;
}

export function isLensFactoryDeployed(): boolean {
  return Boolean(getLensFactoryAddress());
}
