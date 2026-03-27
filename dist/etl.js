"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.etlPipeline = etlPipeline;
const etl_server_1 = require("./etl-server");
async function etlPipeline() {
    while (true) {
        try {
            etl_server_1.etlServer.log.info("Running ETL pipeline...");
            await sleep(5000); // wait 5 seconds
        }
        catch (err) {
            etl_server_1.etlServer.log.error("ETL pipeline error !!");
            await sleep(5000); // prevent crash loop
        }
    }
}
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
