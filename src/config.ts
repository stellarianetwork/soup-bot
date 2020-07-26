import { createLoader, values } from "configuru";

// create loader that cascades overrides and creates a config storage
const loader = createLoader();

// Pass configuration schema to `values` transformer to get configuration
export default values({
    bot: {
        uri: loader.string("URI"),
        accessToken: loader.string("ACCESS_TOKEN"),
    },
});
