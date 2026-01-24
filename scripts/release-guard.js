const site =
  process.env.NEXT_PUBLIC_PLASMIC_SITE_TAG ||
  process.env.PLASMIC_SITE_TAG;

const release =
  process.env.RELEASE_CHANNEL ||
  process.env.NEXT_PUBLIC_RELEASE_CHANNEL;

console.log("🔍 Release Guard:", { site, release });

// Always allow dev
if (site === "dev") {
  console.log("✅ Dev build allowed");
  process.exit(0);
}

// Block prod unless explicitly released
if (site === "prod" && release !== "prod") {
  console.error("❌ Prod build blocked. Set RELEASE_CHANNEL=prod to deploy.");
  process.exit(1);
}

// Allow prod when armed
console.log("✅ Build allowed");
process.exit(0);
