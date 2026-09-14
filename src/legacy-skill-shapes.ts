// Historical generated skill-card bodies for the retired (pre-0.4.0) skill
// catalog, recovered mechanically from this repository's own history - never a
// hand-written or fuzzy shape. Keys are retired skill IDs; values are the
// SHA-256 of every historical body variant for that ID (summary install, full
// install, and template copy), hashed over UTF-8 bytes with CRLF normalized to
// LF.
//
// Coverage: every historical CLI state in this repository that could have
// installed one of these IDs, so a workspace is prunable regardless of which
// 0.3.x build installed its cards:
//   67a599a (v0.1.0-era template library): installed 18/19 retired skills, 1 not installable in this tree
//   764ccf3 (v0.2.0 release state): installed 19/19 retired skills, 0 not installable in this tree
//   e1a08f6 (0.3.0-dev version bump): installed 19/19 retired skills, 0 not installable in this tree
//   341de53 (v0.3.0 release state): installed 19/19 retired skills, 0 not installable in this tree
//   b983635 (0.3.0-dev catalog refactor): installed 19/19 retired skills, 0 not installable in this tree
//
// This is the evidence behind `prunable`: a card whose bytes hash to one of
// these values is provably a historical AgentOS artifact, so opt-in pruning
// can remove it. Any byte a human changed changes the hash, which is what
// keeps forks ("manual-review") safe.
//
// Regenerate only from real history. An empty list means "no evidence", i.e.
// manual-review.
export const LEGACY_SKILL_CARD_HASHES: Readonly<Record<string, readonly string[]>> = {
  'agent-output-verification': [
    '745debfece6c8418ec584adb411ef0db241d2c13214a254eaa17c3a0ed24a69f',
    '9dae37814dcc32325cc642a8d7851cbfc1299aa8ddde9eb1e2da93e6c460a77d',
    'ab3f55f54e3c69a484a26ff85d7cf9936dcbf997aca0ce193b13a67cf6ba9c9b',
    'bdd2d1629be28dfa537bff1ecda022cad273195d18b4bc16ebb99d8d9fbaad7d',
  ],
  'ai-slop-design-review': [
    '5685c8af6adaea9737d12ccdf6783b980428a5ad1bdf7d802ab29566313448d4',
    '614e144a48e84e890cfac3435fb29fc85f30feffdc1b231003668ceaaee6a3ce',
    'b25c376cf6aa5530219854af75088e22623642de600a1f090d4a6b0200d0d48f',
    'd6506ef96628b8286a9562bb4093917c4411fcfcddfe359ef0c3dda7221841c8',
    'f7d9a414931ac8f3761e4ba1cb84deefc26c1703ea8833a0271043d6e371a4ea',
  ],
  'backend-pr-review': [
    '2f5f865cb84d6db64c49c7a61334a2325d24ae09574822e31566cfbd554b2709',
    '685448e412887a974a1e49d990e2058ebdd703bd163e7bcdf1ba80c6b421e53e',
    'a6dc7b6fa09c83d655db791f06d4cc478f7e88ee2ef01ce73f683c41f51a51e2',
    'd0e6dbcbb9317b79fc4b670d95d2a5ead75538709243c3ebacd3bf99533573a1',
  ],
  'backend-service-verification': [
    '044f62be0a73dbb5dd9ae2fa86c4cb4d21c08a009738cf81e91d8eb89f274981',
    '3a8a2fea12987561b825f48114ce8a454128ed834f563c38fbe804ca0cc89861',
    '6f0e6fc345b4f107ced536d9e1fd498364163447d1ededb6260835ddce7cb5d3',
    '890d128544a2b6dc66227640dd2d016cb25ce971eb772957b9712c06227a537d',
    '9d192eb77e90f04f9b45f76bdf772a3cfd9ab212c711d0a7bc50d619d41a7ed7',
  ],
  'conventional-commit': [
    '173c5bde3f89cba193806585fa8faacd98f50444ad27282cd3c3dad1abe07e25',
    '1bb2050045e73555aa68f54ad63c1ed42f12f290f4c8b7892f1a0a008001a750',
    '3ace5d009bef17ded3a1f77198309328020b96a0fa237364de72845ac5c8c1a2',
    '440211dd5863f286573bb46fe4e008fb16a2b0f39118708419967e338b223d56',
    '52126b1f1674123b3d17f4c326bd5d95cd777c29a923daf1a23f673c9f694d99',
  ],
  'frontend-build-verification': [
    '4f57d77461a1885b8f77488960e09a8254f93cfc25a5a40b661ce18ac6ba431a',
    '7ecf3cf1e237611dfa529457498f8b35661b9ba3514748e78da3e11beb554c79',
    'a71ce2bb862d29c8c87074e8589338585894c80ef2b088e861416766bc594d0f',
    'cf9e5d1e1b8173bacf7092a5155e4023317c772ae90df7367efa85924782351f',
    'f9042a9663d2d6a78e1f54c5fbd069ec90cdd1c5c6e726a5a935a17388e9e05b',
  ],
  'full-system-rehearsal': [
    '5ef27abafe3fe00633f00f7b055043dbddea678b207deec2b4e63b84599ae615',
    '6b883fa6b695907fb39ec54110f53b91822bc7125b1eed4eaf90322709f914b2',
    '94340e0b3a55ca392bd40ae146544f513be11c7705a24d230e511f65aebcfd3d',
    'deb67460e8e3b3da28ee63a798899be44c3c339879ae01fc35b1f5a43a028a31',
    'ff33ac8c5d537fe41d5ead92eb77f12a5ad09d40e5b53ddc69a860ed74cdb5c2',
  ],
  'github-actions-verification': [
    '1eb7b4544765dbadebc595af5af07f042e72ab04f2a9ba85b7b0fd5235b51d38',
    '607cb4914ddc7c18e45f7fae7fcd06f97a3dd3a343ef8631343accae2d1e473e',
    'a650a3286aa645e475b931ba1fa2dfef48d499be05425883b7aa95f37cc08924',
    'c73e85136a7b307d2125c3ad455bc5ab5fd0312251bb453e1d7b84a565ca6c06',
    'f180ae01bd590dd8fc65ec4a11ad9b33defb442d13f0a22ec7c2cd4240aebbfb',
  ],
  'github-code-review': [
    '33919e2ead5dcb67cd4dcd9fb170591225000978971a3a137fa7f31d268bfafd',
    '3ae6ccdf71730f7a233e44d3082cfea5219699094509249c0c312c5424fdc3ff',
    '632c5d979e197947286193a9675197e6e110a9b0c656d357de506c33ed1d6bf3',
    'b8dbf0f4599150a121bba5a52fdc04ed16cd964c91e9f53b162e2fa42176305f',
  ],
  'github-pr-workflow': [
    '16b40d4540784e53675f11792edef04f2ff0631ddcfac055790243c4251f60f6',
    '2257375ae60212975320696157245ba79374b055dfb3a281ecdd8d1cbfe7aff0',
    '358af59d62313e2030464adee143228107e57e149720f4066705e5b8f8aa087d',
    '7fcf62c81d6159cd3c3d14193b479c7ab246621c717887c8acfed58651b608c3',
    'd3244a9de19527271d712f87964a32d5745c4fc0ded4769efd5eae08bcd6f95a',
  ],
  'grounded-codebase-docs': [
    '0a180b59a050a316631abfb39512a43d10dfa358847753d841f09d374ede8bca',
    '64ff03bf43c7d7ddf81fef4cf276ae61037ab3e8556ce109c93b06cc9a33f11a',
    '79c86a958110bcb68ef3cd10ec3a8024aba9ed1224a8080ca857e3e68c7777f0',
    'b70399f556824c0f9c60183d360c782f833ed41316203e4d5c18d70d71e4ca53',
  ],
  'interface-feel-polish': [
    '1221ab7094ea743fb198fe104d0dee76efed99a21723c379fa054dd6e24ea3e5',
    '36cf9260acda46f7328a691d054ab5c09adfd078123f5a1a661aa2a204f0fb3e',
    '8b08a7ec2f9b72808b544ba25e9d318d267352cc000f551555b78b0e687c0301',
    'b35cfd3bf96d02bd1b86e70eb7ba752311b8163e055d5a561b34c84fba741eb8',
  ],
  'nestjs-auth-guards': [
    '2da855068b760ec7404ab11f3d9894ae8d44c4a47fe36041c7ed9437617de8b5',
    '5309b82c6d2b4c5620bd34ae1ef521fd848f4c0d37091632d665f84cd82e3b54',
    '5c57efafcdf835095859d2e71940bfd10cea2f6fe5f0b31bd228d04eacbf9c2b',
    'e273b50b8a9a54815e0b86c39633417c3b68db0dd9a726685a72e3c27222a9da',
  ],
  'nestjs-feature-implementation': [
    '2b5306b09dcff5ccea3324918054fb369114ee2952e3a3a5c854a72c9ad84040',
    '57d71e5de5fca95b21be19c09aa6e42146500247cf19e3a219f0e1fe27f771e8',
    '5ea3e7e457b95510daada0a0145f252716189702e0aa942f15ee8850c2abd8ac',
    '728f20a3ad36e65b8ad547fa04c2d33cedff32e2fa40aea48a969e13751476d1',
    '93651e2816c50a9ca596955448af3907916c5893516ad60c40d5a943cdea716a',
  ],
  'nuxt-e2e-testing': [
    '1c4431c3a19b0ef6aba56dd9a59caf126b468a2ea0adec34b4d8b32d24b090a0',
    '85d05a3d635ffac5c59b9efc05eecf86fa880db1d9c9c4ce7212ec717fb5f103',
    'bcd8124d41582af1b3cd6012b3711ed453cc1b0206af0ea53aff925cd99d08be',
    'c00d1c1e4162221d8b49bc80bd797db0b91a128a23b4d351d9ea59fba66aeef4',
  ],
  'requesting-code-review': [
    '1315832dd5b18520a94f3027b186dcfcd42e721b61401d7c81ecf35b387feda6',
    '32c9bc6461a58872fe68a292a5f812ed4de7cb488b842fc7d6d38a3474074f53',
    'bd247d6be5e6703414351a86a57217230a04ba0a74307d066b45ef58bb8db73c',
    'c32ee4a79097dcf4e66b19c402d0537b23de193651926642dc42181a4e2702d4',
  ],
  'secret-scanner-safe-edits': [
    '5a43eb9d618f176189683f4c77d81208385560578bf1e19f8556b989e32a9519',
    '8cbe640a7070e1a479a1a6afe98d859873f706578bc118d21ef0c29528dbaf9e',
    '8d1d3ee9efb693381147083b53d0420f330cded6bea1391479ed616688841f69',
    'fab461bc0d171e3a237ba3f2a335d64237cef4796057f4fc5d0de4c426a14b77',
  ],
  'shared-repo-git-safety': [
    '0d53837ad52e4d440c812e4eb52ba9dc4dcf6f0d3b1e1305e161fe91c35f5188',
    '7b740f8ed809926760f29b7320bc97033fd1fae5fc74ed8f20807aa3be19e8ad',
    '965103398f8ac93eb84954a33c99b8b23ec74d360fe1d1931e6775da313e7af8',
    'a9b0c7c8ed4dd5ee2be328963b147131768288a89236b49e28319a42b7b1de84',
    'cd1173e39f1c8d29cf73e97a27c57d0ed275dbbf8de9d4cf758bc59c2e43784b',
  ],
  'systematic-debugging': [
    '1e5af82c7e26285c5093b55582a8c455aff271d5a5f105ed2da9ba78d18ad3cb',
    '2283101268f93b51282c7e5963cb26e1862d08b6151d1d039d9c75d220835150',
    '58bfc3892e8fb033c75de6e8df199dbd551b234697d36b4a12daf39d0c0bdd29',
    '8742eda1f19d6bf3b1f69cf252e6534cf57ea957ca5d1d1ba61c47e8cdc9ca60',
    'ca210506234ab4ac6bb9f8fec015916f48a0988f0d6f370c021a4efe74722c29',
  ],
};
