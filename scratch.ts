async function main() {
  const res = await fetch("https://api.instafinancials.com/static/js/main.082f336a.js");
  const text = await res.text();
  console.log("length:", text.length);
  // Let's find string literals that contain api paths or endpoints
  const matches = text.match(/"\/api\/(?:[^"\\]|\\.)*"/gi);
  if (matches) {
    const unique = [...new Set(matches)];
    console.log(unique.slice(0, 50));
  }
}
main().catch(console.error);
