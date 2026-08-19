/**
 * Deploys LensFactory.py (with Lens.py's source embedded as its constructor
 * argument, matching the verified genlayerlabs "Registry" factory pattern)
 * to a GenLayer network, and writes the resulting address into
 * frontend/lib/contracts.ts.
 *
 * Usage (raw private key):
 *   PRIVATE_KEY=0x... CREATION_STAKE_WEI=0 npx tsx deploy/001_deploy_lens_factory.ts [network]
 *
 * Usage (safer -- a genlayer CLI keystore, decrypted in-process, never
 * written to disk or printed):
 *   KEYSTORE_PATH=/path/to/keystore.json KEYSTORE_PASSWORD=... CREATION_STAKE_WEI=0 \
 *     npx tsx deploy/001_deploy_lens_factory.ts [network]
 *
 * network defaults to "bradbury" (testnetBradbury). Pass "studio" for
 * studionet, or "asimov" for testnetAsimov.
 *
 * This script is never run automatically by any other part of this repo.
 * A human runs it deliberately, with a deliberately-funded deployer key.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createAccount, createClient } from "genlayer-js";
import { studionet, testnetAsimov, testnetBradbury } from "genlayer-js/chains";
import { TransactionStatus } from "genlayer-js/types";
import { Wallet } from "ethers";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const LENS_PATH = join(ROOT, "contracts", "Lens.py");
const FACTORY_PATH = join(ROOT, "contracts", "LensFactory.py");
const CONTRACTS_TS_PATH = join(ROOT, "frontend", "lib", "contracts.ts");

const NETWORKS = {
  bradbury: { chain: testnetBradbury, addressKey: "bradbury" as const },
  studio: { chain: studionet, addressKey: "studio" as const },
  asimov: { chain: testnetAsimov, addressKey: "asimov" as const },
};

type NetworkArg = keyof typeof NETWORKS;

async function resolvePrivateKey(): Promise<`0x${string}`> {
  if (process.env.PRIVATE_KEY) return process.env.PRIVATE_KEY as `0x${string}`;

  const keystorePath = process.env.KEYSTORE_PATH;
  const keystorePassword = process.env.KEYSTORE_PASSWORD;
  if (keystorePath && keystorePassword) {
    const keystoreJson = readFileSync(keystorePath, "utf-8");
    const wallet = await Wallet.fromEncryptedJson(keystoreJson, keystorePassword);
    return wallet.privateKey as `0x${string}`;
  }

  throw new Error(
    "Set PRIVATE_KEY, or both KEYSTORE_PATH and KEYSTORE_PASSWORD, in the environment before deploying."
  );
}

// Deliberately excludes ACCEPTED -- ACCEPTED can still be appealed and
// reversed before FINALIZED, and this script writes the resulting address
// straight into frontend/lib/contracts.ts, which the frontend then treats
// as the live contract. This is a one-shot CLI deploy, not a live polling
// UX with a latency budget to protect, so there is no real cost to waiting
// for the fully-settled outcome.
const TERMINAL_STATUSES = new Set([
  TransactionStatus.FINALIZED,
  TransactionStatus.UNDETERMINED,
  TransactionStatus.CANCELED,
  TransactionStatus.LEADER_TIMEOUT,
  TransactionStatus.VALIDATORS_TIMEOUT,
]);

async function pollUntilTerminal(
  client: ReturnType<typeof createClient>,
  hash: `0x${string}`,
  { intervalMs = 3000, maxAttempts = 100 } = {}
) {
  let lastStatus: string | null = null;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const transaction = await client.getTransaction({ hash });
    const status = transaction.statusName ?? TransactionStatus.PENDING;
    if (status !== lastStatus) {
      console.log(`  status: ${status}`);
      lastStatus = status;
    }
    if (TERMINAL_STATUSES.has(status)) return transaction;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error("Timed out waiting for deployment to reach a terminal status");
}

async function main() {
  const networkArg = (process.argv[2] ?? "bradbury") as NetworkArg;
  const network = NETWORKS[networkArg];
  if (!network) {
    throw new Error(`Unknown network "${networkArg}". Valid: ${Object.keys(NETWORKS).join(", ")}`);
  }

  const creationStakeWei = BigInt(process.env.CREATION_STAKE_WEI ?? "0");
  const privateKey = await resolvePrivateKey();

  const account = createAccount(privateKey);
  const client = createClient({ chain: network.chain, account });

  const lensSource = readFileSync(LENS_PATH, "utf-8");
  const factorySource = readFileSync(FACTORY_PATH, "utf-8");

  console.log(
    `Deploying LensFactory to ${network.chain.name} as ${account.address} (Lens.py source: ${lensSource.length} bytes, creation stake: ${creationStakeWei} wei)...`
  );

  const hash = await client.deployContract({
    code: factorySource,
    args: [lensSource, creationStakeWei],
  });
  console.log(`Deploy tx: ${hash}`);

  const transaction = await pollUntilTerminal(client, hash);

  if (transaction.statusName !== TransactionStatus.FINALIZED) {
    throw new Error(`Deployment did not finalize (status: ${transaction.statusName}).`);
  }

  // genlayer-js@1.1.8's GenLayerTransaction type puts the deployed address
  // at txDataDecoded.contractAddress -- verified against the installed
  // package's own .d.ts on a prior deploy from this same stack.
  const deployedAddress =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (transaction as any).txDataDecoded?.contractAddress ??
    (transaction as any).contractAddress ??
    (transaction as any).to_address;
  if (!deployedAddress) {
    throw new Error(`Deployment succeeded but no contract address was found in the receipt: ${JSON.stringify(transaction)}`);
  }

  const contractsTs = readFileSync(CONTRACTS_TS_PATH, "utf-8");
  const updated = contractsTs.replace(
    new RegExp(`(${network.addressKey}:\\s*)undefined`),
    `$1"${deployedAddress}"`
  );
  if (updated === contractsTs) {
    console.warn(
      `Warning: could not find a "${network.addressKey}: undefined" entry to update in ${CONTRACTS_TS_PATH} -- update it manually.`
    );
  } else {
    writeFileSync(CONTRACTS_TS_PATH, updated);
    console.log(`Written to frontend/lib/contracts.ts under "${network.addressKey}".`);
  }

  console.log(`\nDeployed LensFactory at ${deployedAddress}`);
  console.log(`Deploy tx hash: ${hash}`);
  const explorer = network.chain.blockExplorers?.default?.url;
  if (explorer) console.log(`Explorer: ${explorer}address/${deployedAddress}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
