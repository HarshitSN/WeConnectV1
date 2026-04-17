const { enrichCompanyCandidate } = require("./lib/enrichment");
// Or we can just fetch the URL and see the text
fetch("https://statusneo.com").then(r => r.text()).then(t => console.log(t.length));
