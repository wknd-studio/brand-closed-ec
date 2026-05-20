import { defineCliConfig } from "sanity/cli";

export default defineCliConfig({
  api: {
    projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID ?? "0syeievd",
    dataset: process.env.NEXT_PUBLIC_SANITY_DATASET ?? "staging",
  },
  deployment: {
    appId: "k4pj8obusw10p4ghtjufqbad",
  },
});
