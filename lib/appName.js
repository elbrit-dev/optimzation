// Which site this build serves, so the installed app is named after it:
// app.elbrit.org builds with the "prod" Plasmic tag (apphosting.prod.yaml),
// app-uat.elbrit.org with "dev" (apphosting.yaml). Anything that isn't prod —
// app-uat, a local build — is named as the test site, so the two installed
// apps can be told apart on a phone.
export const IS_PROD_APP = process.env.NEXT_PUBLIC_PLASMIC_TAG === "prod";

export const APP_NAME = IS_PROD_APP ? "Elbrit One" : "Elbrit UAT";

// Where the home-screen icons live: the test site's carry an orange "UAT"
// pill (public/uat/, made by scripts/make-uat-icons.cjs).
export const APP_ICON_DIR = IS_PROD_APP ? "" : "/uat";
