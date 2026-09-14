// Historical generated skill-card bodies for the retired (pre-0.4.0) skill
// catalog, recovered mechanically from this repository's own history by
// running the 0.3.0 CLI and hashing what it actually installed - never a
// hand-written or fuzzy shape. Keys are retired skill IDs; values are the
// SHA-256 of every historical body variant for that ID (summary install,
// full install, and template copy), hashed over UTF-8 bytes with CRLF
// normalized to LF.
//
// This is the evidence behind `prunable`: a card whose bytes hash to one of
// these values is provably a historical AgentOS artifact, so opt-in pruning
// can remove it. Any byte a human changed changes the hash, which is what
// keeps customized ("manual-review") cards safe.
//
// Regenerate only from real history; see the collector script described in
// the slice-4 notes. An empty list means "no evidence", i.e. manual-review.
export const LEGACY_SKILL_CARD_HASHES: Readonly<Record<string, readonly string[]>> = {
  'agent-output-verification': [
    '745debfece6c8418ec584adb411ef0db241d2c13214a254eaa17c3a0ed24a69f',
    'ab3f55f54e3c69a484a26ff85d7cf9936dcbf997aca0ce193b13a67cf6ba9c9b',
  ],
  'ai-slop-design-review': [
    '614e144a48e84e890cfac3435fb29fc85f30feffdc1b231003668ceaaee6a3ce',
    'b25c376cf6aa5530219854af75088e22623642de600a1f090d4a6b0200d0d48f',
  ],
  'backend-pr-review': [
    '2f5f865cb84d6db64c49c7a61334a2325d24ae09574822e31566cfbd554b2709',
    'a6dc7b6fa09c83d655db791f06d4cc478f7e88ee2ef01ce73f683c41f51a51e2',
  ],
  'backend-service-verification': [
    '044f62be0a73dbb5dd9ae2fa86c4cb4d21c08a009738cf81e91d8eb89f274981',
    '890d128544a2b6dc66227640dd2d016cb25ce971eb772957b9712c06227a537d',
  ],
  'conventional-commit': [
    '3ace5d009bef17ded3a1f77198309328020b96a0fa237364de72845ac5c8c1a2',
    '52126b1f1674123b3d17f4c326bd5d95cd777c29a923daf1a23f673c9f694d99',
  ],
  'frontend-build-verification': [
    '7ecf3cf1e237611dfa529457498f8b35661b9ba3514748e78da3e11beb554c79',
    'f9042a9663d2d6a78e1f54c5fbd069ec90cdd1c5c6e726a5a935a17388e9e05b',
  ],
  'full-system-rehearsal': [
    'deb67460e8e3b3da28ee63a798899be44c3c339879ae01fc35b1f5a43a028a31',
    'ff33ac8c5d537fe41d5ead92eb77f12a5ad09d40e5b53ddc69a860ed74cdb5c2',
  ],
  'github-actions-verification': [
    '1eb7b4544765dbadebc595af5af07f042e72ab04f2a9ba85b7b0fd5235b51d38',
    'c73e85136a7b307d2125c3ad455bc5ab5fd0312251bb453e1d7b84a565ca6c06',
  ],
  'github-code-review': [
    '3ae6ccdf71730f7a233e44d3082cfea5219699094509249c0c312c5424fdc3ff',
    '632c5d979e197947286193a9675197e6e110a9b0c656d357de506c33ed1d6bf3',
  ],
  'github-pr-workflow': [
    '7fcf62c81d6159cd3c3d14193b479c7ab246621c717887c8acfed58651b608c3',
    'd3244a9de19527271d712f87964a32d5745c4fc0ded4769efd5eae08bcd6f95a',
  ],
  'grounded-codebase-docs': [
    '0a180b59a050a316631abfb39512a43d10dfa358847753d841f09d374ede8bca',
    '64ff03bf43c7d7ddf81fef4cf276ae61037ab3e8556ce109c93b06cc9a33f11a',
  ],
  'interface-feel-polish': [
    '36cf9260acda46f7328a691d054ab5c09adfd078123f5a1a661aa2a204f0fb3e',
    'b35cfd3bf96d02bd1b86e70eb7ba752311b8163e055d5a561b34c84fba741eb8',
  ],
  'nestjs-auth-guards': [
    '5309b82c6d2b4c5620bd34ae1ef521fd848f4c0d37091632d665f84cd82e3b54',
    'e273b50b8a9a54815e0b86c39633417c3b68db0dd9a726685a72e3c27222a9da',
  ],
  'nestjs-feature-implementation': [
    '2b5306b09dcff5ccea3324918054fb369114ee2952e3a3a5c854a72c9ad84040',
    '57d71e5de5fca95b21be19c09aa6e42146500247cf19e3a219f0e1fe27f771e8',
  ],
  'nuxt-e2e-testing': [
    '1c4431c3a19b0ef6aba56dd9a59caf126b468a2ea0adec34b4d8b32d24b090a0',
    'bcd8124d41582af1b3cd6012b3711ed453cc1b0206af0ea53aff925cd99d08be',
  ],
  'requesting-code-review': [
    '1315832dd5b18520a94f3027b186dcfcd42e721b61401d7c81ecf35b387feda6',
    'bd247d6be5e6703414351a86a57217230a04ba0a74307d066b45ef58bb8db73c',
  ],
  'secret-scanner-safe-edits': [
    '5a43eb9d618f176189683f4c77d81208385560578bf1e19f8556b989e32a9519',
    '8d1d3ee9efb693381147083b53d0420f330cded6bea1391479ed616688841f69',
  ],
  'shared-repo-git-safety': [
    '0d53837ad52e4d440c812e4eb52ba9dc4dcf6f0d3b1e1305e161fe91c35f5188',
    'a9b0c7c8ed4dd5ee2be328963b147131768288a89236b49e28319a42b7b1de84',
  ],
  'systematic-debugging': [
    '2283101268f93b51282c7e5963cb26e1862d08b6151d1d039d9c75d220835150',
    'ca210506234ab4ac6bb9f8fec015916f48a0988f0d6f370c021a4efe74722c29',
  ],
};
