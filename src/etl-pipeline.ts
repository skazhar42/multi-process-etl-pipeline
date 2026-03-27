import { etlServer } from "./etl-server";

export async function etlPipeline() {
  while (true) {
    try {
      etlServer.log.info("Running ETL pipeline...");
      await sleep(5000); // wait 5 seconds
    } catch (err) {
      etlServer.log.error("ETL pipeline error !!");
      await sleep(5000); // prevent crash loop
    }
  }
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}