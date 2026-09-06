const { initPlasmicLoader } = require("@plasmicapp/loader-nextjs");
const PLASMIC = initPlasmicLoader({
  projects: [{
    id: process.env.NEXT_PUBLIC_PLASMIC_PROJECT_ID || "b6mXu8rXhi8fdDd6jwb8oh",
    token: process.env.NEXT_PUBLIC_PLASMIC_PROJECT_TOKEN || "hKaQFlYDzP6By8Fk45XBc6AhEoXVcAk3jJA5AvDn7lEnJI4Ho97wv9zkcp0LvOnjUhV0wQ6ZeeXBj5V135I9YA",
  }],
  preview: false,
});
PLASMIC.fetchPages().then(pages => {
  console.log("PAGES:", pages.length);
  pages.forEach(p => console.log(p.path, "|", p.name));
}).catch(e => console.log("ERR", e.message));
