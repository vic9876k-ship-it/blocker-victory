// import fs from "fs";

// const SAFE_DOMAINS = [
//   "firestore.googleapis.com",
//   "identitytoolkit.googleapis.com",
//   "securetoken.googleapis.com",
//   "accounts.google.com",
//   "apis.google.com",
//   "googleapis.com",
//   "googleusercontent.com",
//   "firebaseapp.com",
//   "google.com",
//   "gstatic.com",
//   "chrome-extension"
// ];

// const data = JSON.parse(
//   fs.readFileSync("/public/sites.json", "utf8")
// );

// const sites = data.blocked || [];

// const rules = [];

// let id = 1;

// for (const site of sites) {

//   if (!site) continue;

//   const clean = String(site)
//     .toLowerCase()
//     .replace(/^https?:\/\//, "")
//     .replace(/^www\./, "")
//     .split("/")[0]
//     .trim();

//   if (
//       SAFE_DOMAINS.some(d => clean.includes(d))
//   ) continue;

//   rules.push({

//       id: id++,

//       priority: 1,

//       action: {

//           type: "redirect",

//           redirect: {

//               extensionPath: "/blocked.html"

//           }

//       },

//       condition: {

//           regexFilter:
//           `^https?:\\/\\/([^\\/]+\\.)?${clean.replace(/\./g,"\\.")}\\/?.*`,

//           resourceTypes: [
//               "main_frame"
//           ]

//       }

//   });

// }

// fs.writeFileSync(

//     "./src/rules.json",

//     JSON.stringify(rules,null,2)

// );

// console.log(
//     `Generated ${rules.length} rules`
// );