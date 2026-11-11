// ─── LIVE config — Arc Runners mechanics on Elysium ──────────────
window.MINT_CONFIG = {
  name: "ELY KITTIES",
  tagline: "2,222 pixel kitties, drawn entirely on-chain on Elysium.",
  contract: "0xF8fE77FF8596cb982D920706B0a48056CF67BC90",   // ElyKitties on Elysium
  renderer: "0x31Dd75708077B0C87Fc20F315a66051b6C63B785",   // on-chain art (draws any id)
  chainId: 99901,              // Elysium mainnet
  chainName: "Elysium",
  rpcUrl: "https://elysium-mainnet.g.alchemy.com/v2/hDRpdrUY4tFz5MVt05Jcc",   // Alchemy (main)
  rpcFallbacks: ["https://rpc.elysium.kinetiq.xyz", "https://elysium.drpc.org"],   // used if the main one fails
  currencySymbol: "HYPE",      // Elysium gas token (18 decimals)
  blockExplorer: "https://elysium.kinetiq.xyz/explorer",
  priceEth: "0.007",           // ~$0.50 mint fee in HYPE
  maxPerTx: Infinity,
  totalSupply: 2222,
  mintStart: "",               // e.g. "2026-11-20T15:00:00Z" — button counts down until then
  mintFnName: "mint",

  wlSite: "https://elykitties.xyz/",
  xHandle: "ElyKitties",
};

// [image id (= token id drawn on-chain), name, backdrop colour]
window.EK_KITTIES = [ [ "1", "Snow Kitty", "#12403c" ], [ "2", "Cocoa Crown", "#12403c" ], [ "3", "Snow Helm", "#fac45c" ], [ "4", "Golden Beanie", "#f6b094" ], [ "5", "Ginger Mint Flame", "#40b48c" ], [ "6", "Ginger Kitty", "#f6b094" ], [ "7", "Cocoa Laurel", "#b094e2" ], [ "8", "Lilac Kitty", "#e2ded6" ], [ "9", "Cream Helm", "#fac45c" ], [ "10", "Shadow Laurel", "#12403c" ] ];
