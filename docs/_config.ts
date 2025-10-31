import lume from "lume/mod.ts";
import lumocs from "lumocs/mod.ts";

const site = lume({
  src: "src",
  location: new URL("https://cross-org.github.io/kv/"),
});

site.use(lumocs());

export default site;
