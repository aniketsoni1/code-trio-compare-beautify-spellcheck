// Generates Code Trio's built-in word lists.
//
// The lists are ORIGINAL, hand-curated for this project and dedicated to the
// public domain under CC0-1.0 (see docs/dictionaries.md). This script is the
// single source of truth: edit the arrays below and re-run `npm run assets` (or
// `node scripts/generate-dictionaries.mjs`) to regenerate the committed data.
//
// Output:
//   packages/dictionaries/src/data/base.txt        (human-readable list)
//   packages/dictionaries/src/data/technical.txt    (human-readable list)
//   packages/dictionaries/src/data/base.ts          (bundled runtime module)
//   packages/dictionaries/src/data/technical.ts      (bundled runtime module)

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = resolve(here, "../packages/dictionaries/src/data");

const words = (s) => s.trim().split(/\s+/);

// --- Base English: common function words, verbs, nouns, adjectives, adverbs ---
const BASE = [
  // articles, pronouns, prepositions, conjunctions
  `a an the this that these those i you he she it we they me him her us them my your his its our their mine yours
   ours theirs who whom whose which what where when why how all any both each few many some most other another
   such no nor not only own same so than too very can will just should now and or but if then else because as
   of at by for with about against between into through during before after above below to from up down in out
   on off over under again further once here there`,
  // common verbs (base + frequent inflections)
  `be is am are was were been being have has had having do does did doing say says said get gets got gotten
   make makes made making go goes went gone going know knows knew known think thinks thought take takes took
   taken taking see sees saw seen come comes came coming want wants wanted use uses used using find finds found
   give gives gave given tell tells told work works worked call calls called try tries tried ask asks asked need
   needs needed feel feels felt become becomes leave leaves left put puts mean means meant keep keeps kept let
   lets begin begins began seem seems help helps show shows showed shown hear play runs ran run move moves like
   likes liked live lives believe hold holds bring brings happen write writes wrote written provide sit stand
   lose pay meet include continue set learn change lead understand watch follow stop create speak read spend grow
   open walk win offer remember consider appear buy serve die send build stay fall reach kill remain add return
   choose develop carry break receive agree support hit produce eat cover catch draw`,
  // common nouns
  `time year people way day man thing woman life child world school state family student group country problem
   hand part place case week company system program question work government number night point home water room
   mother area money story fact month lot right study book eye job word business issue side kind head house
   service friend father power hour game line end member law car city community name president team minute idea
   body information back parent face others level office door health person art war history party result change
   morning reason research girl guy moment air teacher force education foot boy age policy process music market
   sense nation plan college interest death experience effect use class control care field development role effort
   rate heart drug show leader light voice wife police mind price report decision son view value base example`,
  // adjectives
  `good new first last long great little own other old right big high different small large next early young
   important few public bad same able free full sure low late hard major better economic strong possible whole
   real social clear likely certain recent short human local difficult available political nice easy simple fast
   green white black red blue yellow brown gray grey pink purple orange dark bright heavy warm cold hot cool
   deep wide narrow thick thin flat round square empty quiet loud safe common special similar single double main
   final total central natural physical legal serious modern general basic private personal current national`,
  // adverbs and misc
  `up so out just now how then more also here well only very even back there down still around however too then
   never really most why again away why always usually often sometimes rarely soon later already almost enough
   quite rather nearly perhaps maybe indeed instead therefore otherwise together apart forward backward inside
   outside upward downward daily weekly monthly yearly`,
  // numbers, time, colors, days, months
  `zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen
   eighteen nineteen twenty thirty forty fifty sixty seventy eighty ninety hundred thousand million billion first
   second third fourth fifth sixth seventh eighth ninth tenth monday tuesday wednesday thursday friday saturday
   sunday january february march april may june july august september october november december spring summer
   autumn winter today tomorrow yesterday`,
  // everyday extras that appear in prose and comments
  `example please thanks thank welcome hello world note notes todo done okay yes maybe about above across after
   along among around behind beside besides beyond despite except inside outside since toward towards underneath
   unless until upon versus within without according regarding concerning email website page link click button
   user users account password login logout profile settings preferences default option options feature features
   support documentation guide guides tutorial tutorials chapter section summary overview introduction conclusion
   question answer solution problem problems issue issues error errors warning warnings message messages`,
  // high-frequency English words + common inflections (reduces comment noise)
  `greeting greetings hello goodbye welcome demo demos deliberate deliberately intentional intentionally
   misspell misspelled misspelling misspellings correct correctly incorrect incorrectly correction corrections
   spell spells spelled spelling speller checker checkers caller callers something someone somewhere sometimes
   somehow anything anyone anywhere everything everyone everywhere nothing nobody nowhere flag flags flagged
   smoke reword rewrite rewritten payload payloads sample samples snippet snippets placeholder placeholders
   able unable ability enable enabled disable disabled available unavailable availability
   apply applies applied applying applicable ensure ensures ensured ensuring avoid avoids avoided avoiding
   allow allows allowed allowing prevent prevents prevented preventing require requires required requiring
   contain contains contained containing provide provides provided providing produce produces produced producing
   perform performs performed performing performance handle handles handled handling process processes processed
   processing render renders rendered rendering compute computes computed computing generate generates generated
   generating validate validates validated validating parse parses parsed parsing serialize serialized
   normalize normalized normalizing convert converts converted converting compare compares compared comparing
   comparison comparisons match matches matched matching replace replaces replaced replacing remove removes
   removed removing insert inserts inserted inserting delete deletes deleted deleting update updates updated
   updating create creates created creating build builds built building compile compiles compiled compiling
   detect detects detected detecting select selects selected selecting expect expects expected expecting
   return returns returned returning define defines defined defining declare declares declared declaring
   import imports imported importing export exports exported exporting extend extends extended extending
   implement implements implemented implementing override overrides overridden overriding inherit inherits
   register registers registered registering resolve resolves resolved resolving reject rejects rejected
   throw throws thrown throwing catch catches caught catching wrap wraps wrapped wrapping unwrap
   iterate iterates iterated iterating loop loops looped looping recurse recursive recursion nested nesting
   sort sorts sorted sorting filter filters filtered filtering reduce reduces reduced reducing map mapped
   mapping fetch fetches fetched fetching load loads loaded loading save saves saved saving read reads
   reading write writes writing wrote written print prints printed printing log logs logged logging
   click clicks clicked clicking toggle toggles toggled toggling scroll scrolls hover focus blur
   whitespace horizontal vertical trailing leading indentation indent indents indented indenting
   deterministic reproducible idempotent offline online privacy respecting respectful lightweight
   granularity granular structural token tokens tokenize tokenized identifier identifiers acronym acronyms
   camel snake kebab screaming case cases lowercase uppercase capitalize capitalized suggestion suggestions
   diagnostic diagnostics severity fixable quick fixes preview previews orchestrator orchestrate adapter
   adapters registry pluggable bundle bundled bundling package packaged packaging manifest metadata badge
   badges screenshot screenshots checkout stash workspace workspaces repository repositories contributor
   contributors maintainer maintainers roadmap limitation limitations troubleshooting acceptance evidence`,
  // common software-prose words that show up constantly in comments and docs
  `code coding comment comments function functions variable variables value values method methods class classes
   object objects array arrays list lists item items file files folder folders directory directories path paths
   input output name names names key keys index indexes length size count counts result results returns example
   examples test tests case cases type types data field fields record records table tables row rows column columns
   number numbers text texts line lines word words character characters format formats version versions update
   updates change changes create creates created delete deletes deleted remove removes removed add adds added
   check checks checked compare compares comparison beautify format formatter formatting spelling speller
   dictionary dictionaries offline online privacy private public license readme changelog install installs
   installed package packages release releases build builds deploy deploys usage command commands option options
   configuration settings enable enabled disable disabled true false null valid invalid enabled disabled`,
];

// --- Technical / programming dictionary ---
const TECHNICAL = [
  // languages / runtimes
  `javascript typescript python java kotlin swift golang rust ruby php perl scala haskell elixir erlang clojure
   dart lua julia matlab bash shell powershell sql graphql html css scss sass less json yaml yml toml xml
   markdown node nodejs deno bun jvm dotnet`,
  // frameworks / libraries / tools
  `react preact vue svelte angular nextjs nuxt remix vite webpack rollup esbuild babel eslint prettier vitest
   jest mocha chai cypress playwright puppeteer express fastify koa nestjs django flask fastapi rails spring
   laravel tailwind bootstrap redux zustand recoil axios lodash rxjs graphql apollo prisma sequelize mongoose
   pandas numpy pytorch tensorflow sklearn matplotlib`,
  // devops / infra / cloud
  `git github gitlab bitbucket docker kubernetes helm terraform ansible jenkins circleci travis nginx apache
   redis postgres postgresql mysql mariadb sqlite mongodb cassandra elasticsearch kafka rabbitmq grafana
   prometheus datadog sentry aws azure gcp lambda ec2 s3 dynamodb cloudfront cdn dns tls ssl ssh vpn oauth jwt
   saml sso api apis sdk cli gui ide repo repos monorepo`,
  // programming concepts / keywords
  `async await promise callback closure recursion iterator generator coroutine mutex semaphore thread threads
   concurrency parallelism runtime compiler transpiler linter formatter parser lexer tokenizer tokenize ast
   token tokens diff diffs merge rebase commit commits branch branches stash checkout pull push clone fetch
   boolean int integer float double string char enum struct interface abstract override virtual static const
   readonly nullable undefined nan regex regexp substring substr charcode codepoint utf unicode ascii endian
   bitwise deterministic idempotent immutable mutable serialize deserialize serialization stringify parse encode
   decode hash checksum sha md5 uuid guid namespace metadata schema schemas validator validation config configs`,
  // web / data / files
  `frontend backend fullstack middleware endpoint endpoints route routes router handler request response payload
   header headers cookie session cache caching localstorage sessionstorage websocket http https url uri urls
   query params param hostname localhost port proxy cors csrf xss dom viewport svg png jpg jpeg gif webp
   pdf docx pptx xlsx csv tsv vsix plugin plugins extension extensions marketplace changelog readme license
   codebase filepath filename dir dirname subdir glob globs stdout stderr stdin env dotenv`,
  // common abbreviations / product terms
  `app apps webapp devtools ci cd cicd repo dev prod staging qa uat kpi mvp poc ux ui npm npx pnpm yarn cli
   config env vars var async sync util utils lib libs pkg pkgs impl init deinit config configs auth admin
   dashboard workspace workspaces plaintext whitespace multiline inline offset offsets substring codepoint`,
];

function build(list) {
  const set = new Set();
  for (const block of list) {
    for (const w of words(block)) {
      const lower = w.toLowerCase();
      if (lower.length > 0) set.add(lower);
    }
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

const base = build(BASE);
const technical = build(TECHNICAL);

mkdirSync(dataDir, { recursive: true });

const header = (name, count) =>
  `# Code Trio built-in ${name} dictionary (${count} words)\n` +
  `# Original, curated for Code Trio. Public domain (CC0-1.0). See docs/dictionaries.md.\n` +
  `# Regenerate with: node scripts/generate-dictionaries.mjs\n`;

writeFileSync(resolve(dataDir, "base.txt"), header("base", base.length) + base.join("\n") + "\n");
writeFileSync(
  resolve(dataDir, "technical.txt"),
  header("technical", technical.length) + technical.join("\n") + "\n",
);

const tsModule = (name, arr) =>
  `// AUTO-GENERATED by scripts/generate-dictionaries.mjs - do not edit by hand.\n` +
  `// Original word list dedicated to the public domain (CC0-1.0).\n` +
  `/** ${arr.length} words. */\n` +
  `export const ${name}_WORDS = ${JSON.stringify(arr.join("\n"))};\n`;

writeFileSync(resolve(dataDir, "base.ts"), tsModule("BASE", base));
writeFileSync(resolve(dataDir, "technical.ts"), tsModule("TECHNICAL", technical));

console.log(`base: ${base.length} words, technical: ${technical.length} words`);
