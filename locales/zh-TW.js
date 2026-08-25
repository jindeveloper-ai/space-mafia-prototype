export const PACK_SCHEMA_VERSION = 1;
export const PACK_VERSION = "0.20.14";

const STAGING_KEY = Symbol.for("mars.net.language-pack-staging.v1");
const trimEnd = (text) => text.replace(/[。.!?！？]+$/u, "");

const pack = {
  meta: {
    title: "MARS.NET · 遊戲房間 #041",
    description: "與三位生活在2050年火星上的朋友一起玩的三分鐘黑手黨推理聊天遊戲。",
    brand: "MARS.NET", gameInfo: "遊戲資訊", home: "返回遊戲開始頁",
    footer: "MARS.NET 好友房間 · 訪客紀錄儲存在本設備，登入後同步到雲端",
    language: "選擇語言", themeModes: { system: "自動", light: "淺色", dark: "深色" },
    themeControl: (mode) => `顯示模式：${mode}。按下即可切換`,
  },
  crew: {
    mina: { name: "米娜", icon: "M", style: "偶像粉絲論壇 · 秒存截圖派", background: "她是地球移民的女兒，出生並長大在火星。她追地球直播和火星演唱會，對截圖與時間線格外敏銳，但遇到本命時偶爾會偏心。說話像粉絲論壇一樣快而有情緒。" },
    juno: { name: "茱諾", icon: "J", style: "開發技術論壇 · 驗證反例派", background: "她是地球移民的女兒，出生並長大在火星，負責維護居住區生命保障設備。她會區分事實與推測，並懷疑過分完美的證據。不賣弄術語，說話重視驗證。" },
    noel: { name: "諾艾爾", icon: "N", style: "直播論壇 · 緊盯反應變化派", background: "她是地球移民的女兒，出生並長大在火星，常看連接地球與火星的直播。她很快就能察覺措辭和反應的變化，會先讀懂氣氛，再簡短地點出要害。" },
  },
  incident: {
    title: "空氣淨化設備停機", place: "居住區 · 氧氣室", time: "22:10 火星標準時",
    confirmed: "居住區空氣淨化設備的安全鎖遭到破壞。",
    description: "火星標準時22:10，居住區氧氣室內的空氣淨化設備安全鎖遭到破壞。請利用與地點和時間相關的線索，把嫌疑引向別人。",
    evidence: "損壞的通行卡",
  },
  claims: {
    seen: { short: "在氧氣室目擊", action: "從氧氣室出來", challengeAction: "從氧氣室出來" },
    machine: { short: "動過淨化器", action: "動過空氣淨化設備", challengeAction: "動過空氣淨化設備" },
    changed: { short: "改過說法", action: "改過案發時間的說法", challengeAction: "改過案發時間的說法" },
  },
  facts: {
    alibi: {
      title: "監控紀錄", text: (name) => `${name}在22:10出現在管制室監控中。`, spokenText: (name) => `${name}在22:10確實被管制室監控拍到了。`,
      firstPersonText: (personality) => ({ record: "等等，我22:10明明就在管制室監控裡。看紀錄。", skeptic: "目前能確定的只有：22:10我出現在管制室監控裡。", behavior: "22:10我在管制室，監控也拍到了。" })[personality],
      badge: "強地點不在場證明", guidance: "與‘從氧氣室出來’或‘動過淨化器’的說法矛盾。", baseReason: (name) => `${name}在22:10出現在管制室監控中，不太可能同時待在氧氣室`,
    },
    access: {
      title: "氧氣室專用工具", text: (name) => `${name}的口袋裡裝著氧氣室專用工具。`, spokenText: (name) => `${name}拿著氧氣室工具是事實。`,
      firstPersonText: (personality) => ({ record: "我承認口袋裡有氧氣室工具。然後呢，這能證明什麼？", skeptic: "能確定的只有工具在我口袋裡，後面的結論仍是推測。", behavior: "工具是在我這裡。不過你馬上咬住這點，還挺有意思。" })[personality],
      badge: "地點關聯線索", guidance: "支持與氧氣室或空氣淨化設備有關的說法。", baseReason: (name) => `${name}持有氧氣室專用工具，具備進入現場的條件`,
    },
    contradiction: {
      title: "時間說法矛盾", text: (name) => `${name}對案發時間給出了兩種說法。`, spokenText: (name) => `${name}說過兩個不同時間，這是事實。`,
      firstPersonText: (personality) => ({ record: "我糾正過時間，只是第一次看錯紀錄。", skeptic: "我糾正了時間。這和改變整套說法要分開看。", behavior: "時間確實說錯過。但你這麼快就撲上來，也挺顯眼。" })[personality],
      badge: "時間矛盾", guidance: "最有力地支持‘改過說法’這一指控。", baseReason: (name) => `${name}對22:10前後的時間說法不一，降低了不在場證明的可信度`,
    },
  },
  subquests: {
    redirect: { title: "淘汰並非你栽贓對象的人。" }, "check-time": { title: "在最後回應中核對22:10紀錄並獲勝。" }, "weak-link": { title: "用關聯薄弱的謊言獲勝。" }, "safe-win": { title: "帶動至少一票，並以★★或更高評價獲勝。" },
  },
  engine: {
    player: "你", unknown: "未知", clueCount: (count) => `${count}條線索${count > 0 ? "已連接" : ""}`,
    errors: { evidenceTarget: "請選擇要栽贓的對象。", evidenceFirst: "請先放置假證據。", accused: "請選擇懷疑對象。", claim: "請選擇要使用的指控。", challengeFirst: "請在其他玩家反駁後再回應。", response: "請選擇回應。", responseFirst: "請先完成最後回應再投票。", hardDefenseFirst: "請按困難模式當前質詢順序作答。" },
    meetingFramed: (personality) => ({ record: "有人把那張卡塞進我置物櫃裡了。先從這查吧。", skeptic: "卡在我置物櫃裡是事實，但放卡的人還沒確定。", behavior: "那張卡不是我的。卡一出現大家就撲過來，挺有意思。" })[personality],
    claimLabel: (name, action) => `${name}${action}`,
    challengeContradiction: (fact, name, action, self, personality) => { const subject = self ? "我" : name; if (personality === "record") return `${fact} 那怎麼還能說${subject}${action}？和紀錄對不上。`; if (personality === "skeptic") return `${fact} 為什麼還說${subject}${action}？兩者至少有一個不成立。`; return `等等。${fact} 怎麼就變成${subject}${action}了？`; },
    challengeSelf: (fact, personality) => { if (personality === "record") return `${fact} 光憑這要放逐我？認真的？`; if (personality === "skeptic") return `${fact} 能確定的只有這些，其餘仍是推測。`; return `${fact} 這線索一出來，你們就只盯我了吧？`; },
    challengeWeak: (fact, name, personality) => { if (personality === "record") return `${fact} 這能證明是${name}做的嗎？`; if (personality === "skeptic") return `${fact} 能確定的只有這些。${name}是黑手黨仍是推測。`; return `${fact} 光憑這直接點${name}？太快了吧？`; },
    responseOptions: (target, time, sameTarget) => [
      { id: "double-down", label: "“相信我親眼看到的”", hint: "堅持最初的指控" },
      { id: "return-evidence", label: `“但卡還是從${target}的置物櫃裡找到的”`, hint: sameTarget ? "繼續懷疑同一對象" : `停止還擊，把話題拉回${target}` },
      { id: "check-time", label: `“再看一遍${time}前後的紀錄”`, hint: "核對案發時間與所有人的說法" },
    ],
    reasons: {
      framedSelf: "我知道有人把通行卡塞進了我的置物櫃", evidenceCard: (name) => `損壞的通行卡在${name}的置物櫃裡被找到`, accusedKnows: "我知道針對自己的指控是假的", claimSupports: (fact) => `該指控符合現有線索——${trimEnd(fact)}`, claimContradicts: (fact) => `該指控與確認事實矛盾——${trimEnd(fact)}`, evidenceMatches: "通行卡與指控指向同一個人", tooPerfect: "證據和說法吻合得過於完美", changedMatters: "說法變化值得納入判斷", maintainedClaim: "遭到反駁後仍堅持同一指控", ignoredFact: "無視已確認事實，強行堅持矛盾說法", overconfidence: "自信程度超過證據所能支持的範圍", confidenceSuspicion: "這份篤定本身就很可疑", reusedFrame: "再次利用了塞進我置物櫃的證據", returnedCard: "把話題重新拉回損壞的通行卡", changedTarget: "首次指控後更換了目標", repeatedEvidence: "從頭到尾只重複同一證據，太刻意了", timeContradiction: "22:10前後的說法不一致", alibiClears: "22:10的管制室監控支持被指控者的不在場證明", noTimeConflict: "核對時間後，被指控者的位置沒有矛盾", hardConsistent: "質詢過程中始終保持同一目標和依據", hardTargetChanged: "長會議中途更換了最初目標", hardFactConflict: "反複提出與公開事實矛盾的指控", weakAlibi: "不在場證明比其他人薄弱",
      join: (first, second) => `${trimEnd(first)}。另外，${trimEnd(second)}`, record: (reason) => `紀錄指向這裡：${trimEnd(reason)}。我投這個`, skeptic: (reason) => `${trimEnd(reason)}。把事實和推測分開看，這仍最合理`, behavior: (reason) => `${trimEnd(reason)}。最後的反應已經說明問題，我投這個`,
    },
  },
  ui: {
    stepAria: (step, label) => `第${step}步：${label}`, profileDefaultName: "你", welcomePill: "2050 · MARS.NET", welcomeTitle: "今晚在火星玩一局黑手黨？", welcomeLead: "不用擔心互相攻擊。和三位朋友來一場三分鐘推理聊天。", welcomeStart: "開始", profileBack: "返回開始頁", profileStep: "MARS.NET 個人檔案", profileTitle: "該怎麼稱呼你？", profileLead: "顯示名稱會出現在遊戲房間和私聊中。", profilePhoto: "選擇大頭貼", profilePhotoOptional: "可選 · JPG、PNG、WebP · 最大2MB", profileName: "顯示名稱", profileNamePlaceholder: "1至12個字元", profileContinue: "儲存並繼續", profilePrivacy: "訪客資料儲存在本設備，登入後將安全同步。", profilePhotoError: "請選擇不超過2MB的JPG、PNG或WebP圖片。",
    homeTutorial: "開啟遊戲教程", homeHello: (name) => `${name} 👋`, homeTitle: "想做什麼？", homePlayEyebrow: "三分鐘遊戲", homePlayTitle: "開始黑手黨遊戲", homePlayLead: "三位AI朋友 · 約三分鐘", homeMultiplayerEyebrow: "雙人上線對戰", homeMultiplayerTitle: "和朋友一起玩", homeMultiplayerLead: "分享代碼，一起推理", homeBack: "返回主頁", bottomNav: { aria: "主菜單", game: "遊戲", chat: "聊天", me: "我的" }, tutorialLabel: "2050 · MARS.NET", tutorialTitle: "遊戲教程", incidentAria: "案件事實", incidentPlace: "地點", incidentTime: "時間",
    communityBoard: "MARS.NET 閒聊論壇 · 剛剛", communityAuthor: "匿名", communityPostTitle: "【歡迎新手】黑手黨還差一人（3/4）", communityPostBody: "歡迎新手，不互相攻擊。已經三個人了，最後一位來嗎？", communityPostMeta: "3條留言 · 17次瀏覽", sceneSetting: "2050年，仍住在地球的你休息時瀏覽MARS.NET，發現火星朋友發布了一條歡迎新手的組隊貼文。", roomBadge: "MARS.NET · 房間 #041", roomMembers: "火星出生的第二代朋友", roomStatus: "3人上線", online: "上線", roleLabel: "本局秘密身份", introTitle: "你是黑手黨。", introLead: "利用假證據和謊言，讓別人拿到兩票。", rulesAria: "遊戲規則", rules: ["把<strong>假證據</strong>放進一人的置物櫃。", "查看三人的<strong>當前事實</strong>。", "在遊戲聊天中說出<strong>你的謊言</strong>。", "普通模式回應一次；困難模式需連續回答<strong>三回合質詢</strong>。", "別人拿到<strong>兩票</strong>你就贏；你拿到兩票則輸。"], start: "進入遊戲房間",
    voice: {
      modeTitle: "選擇遊玩方式", playText: "文字聊天", playVoice: "語音通話", textModeDescription: "閱讀你輸入的指控和回應的標準聊天遊戲", voiceModeDescription: "在限時內多次開口回應的專用通話遊戲", consentEyebrow: "AI語音通話模式", consentTitle: "要用麥克風和三位朋友聊天嗎？", consentLead: "每輪可連續對話。時間結束時，以你最後一次明確表達的立場進行判定。", disclosures: ["通話期間會使用麥克風。", "語音會發送至OpenAI API進行處理。", "應用程式不會儲存原始音訊。依據OpenAI政策，安全監測資料可能最多保留30天。", "你可以拒絕麥克風權限，改用文字模式。"], consentAction: "同意並啟用麥克風", textFallback: "繼續文字聊天", callTitle: "MARS.NET 語音遊戲", callStage: "房間 #041 · 語音會議", captionLabel: "即時字幕", captionOn: "開啟字幕", captionOff: "關閉字幕", mute: "麥克風靜音", unmute: "開啟麥克風", pause: "暫停AI語音", resume: "繼續AI語音", callEffectsOn: "通話音效開啟", callEffectsOff: "通話音效關閉", callEffectsAria: "切換AI語音的電話音效", end: "結束語音通話", reconnect: "重新連接", talkStart: "手動開始說話", talkStop: "結束手動輸入", talkStartHint: "通常無需使用，僅在自動檢測失效時啟用。", talkStopHint: "說完後按下此按鈕發送手動輸入", textInputHint: "語音識別停止時，可在同一會議中輸入文字", textInputPlaceholder: "在此語音會議中輸入", turnLabel: (current, total) => `語音討論 ${current}/${total}`, secondsLeft: (seconds) => `剩餘${seconds}秒`, preparingTurn: "正在準備下一回合討論", turnHelp: "時間結束前可多次開口回應。", turnClosing: "結束本回合交流，進入下一回合。", nextTurnPrompt: (current, total) => `現在是第${current}/${total}輪。再說一個理由。`, finalPosition: (target, claim) => `時間到 · 最終主張：${target} · ${claim}`,
      status: { idle: "通話準備就緒", requesting_permission: "正在確認麥克風權限", connecting: "正在連接朋友", listening: "自動聆聽中 · 直接說話即可", player_speaking: "正在聽你說話", processing: "正在確認你的發言", ai_speaking: "正在發言", paused: "AI語音已暫停", reconnecting: "連接不穩定", ended: "通話已結束", fallback_text: "繼續使用文字模式" }, inputStatus: { connecting: "正在檢查麥克風連接", listening: "麥克風已開 · 請說話", speaking: "檢測到語音", processing: "正在發送剛才的發言", ai: "朋友正在回應 · 結束後會恢復聆聽", muted: "麥克風已靜音" }, inputStatusHint: "檢測到聲音時，麥克風外圈和圓點會變綠。", speaking: (name) => `${name}正在說話`, waitingCaption: "開始說話後，已確認的字幕會顯示在這裡。", clarificationTarget: "你懷疑米娜、茱諾還是諾艾爾？", clarificationClaim: "是因為在氧氣室被目擊、動過淨化器，還是改過時間？", fallbackNotice: "語音暫不可用。請重新連接，或明確切換到文字聊天。", switchedToText: "將繼續使用標準文字聊天模式。",
    },
    friendChatOpen: "一對一聊天", friendChatEyebrow: "遊戲外也上線", friendChatTitle: "好友聊天", friendChatSelectLead: "選擇聊天對象", friendChatSelectTitle: "想給誰發訊息？", friendChatSelectDescription: "聊遊戲，也可以聊日常。三個人的說話和思考方式各不相同。", friendChatBack: "返回好友列表", friendChatWith: (name) => `與${name}聊天`, friendChatDay: "私聊 · 今天", friendChatOlder: "載入更早訊息", friendChatOlderLoading: "正在載入更早訊息…", friendTranscriptAria: (name) => `與${name}的私聊`, friendChatPlaceholder: (name) => `給${name}發訊息`, friendEmojiOpen: "開啟表情選擇器", friendEmojiPicker: "快捷表情", friendEmojiInsert: (emoji) => `插入${emoji}表情`, friendSticker: "動態貼紙", friendStickerPicker: "MARS.NET原創動態貼紙", friendStickerSend: (label) => `發送“${label}”貼紙`, friendChatPrivacy: "訪客訊息儲存在本設備，登入後會私密儲存到雲端",
    friendCall: {
      start: "語音通話", startAria: (name, seconds) => `呼叫${name} · 今天剩餘${Math.floor(seconds / 60)}分${seconds % 60}秒`, title: (name) => `與${name}語音通話`, dailyLimit: "每日5分鐘 · 當前好友", remaining: (clock) => `今天剩餘${clock}`, location: (name) => `${name} · 火星居住區`, end: "結束通話", mute: "靜音", unmute: "取消靜音", callEffectsOn: "通話音效開啟", callEffectsOff: "通話音效關閉", callEffectsAria: "切換好友語音的電話音效", textFallback: "文字輸入", textPlaceholder: "麥克風未識別時請打字", privacy: "不會儲存原始音訊，只會在本設備或帳號中儲存通話時長。", limitReached: "今天與這位好友的5分鐘已用完。",
      status: { idle: "正在準備通話…", requesting_permission: "正在連接麥克風…", dialing: "等待接聽…", connecting: "正在連接…", answered: "通話已接通", player_speaking: "正在發送你的聲音", thinking: "正在聽…", ai_speaking: "通話中", listening: "等待你說話", ended: "通話已結束", error: "無法接通" }, micStatus: { requesting_permission: "正在連接麥克風", dialing: "正在呼叫", answered: "已接通", player_speaking: "你正在說話", thinking: "正在準備回應", ai_speaking: "好友正在說話", listening: "麥克風已開", error: "通話錯誤", ended: "通話已結束" }, error: { friend_call_unsupported: "此瀏覽器不支持語音通話。", friend_call_secret_failed: "無法獲取語音通話連接資訊。", friend_call_daily_limit: "今天與這位好友的5分鐘已用完。", guest_friend_call_daily_limit: "今天的訪客連接次數已達上限，請明天再試。", friend_call_negotiation_failed: "無法連接通話伺服器，請稍後再試。", friend_call_channel_timeout: "通話連接超時。", friend_call_channel_failed: "無法開啟通話資料通道。", microphone_missing: "未找到可用麥克風。", microphone_denied: "請在Chrome和macOS設定中允許麥克風權限。", microphone_timeout: "麥克風連接時間過長，已切換到文字模式。", default: "連接通話時出現問題，請重試。" },
    },
    affinity: (score) => `親密度 ${score}`,
    languageRestartConfirm: "更改語言將結束當前遊戲並返回開始頁。是否繼續？",
    languageSettings: {
      open: "語言與無障礙設定", eyebrow: "語言包", title: "語言與無障礙", description: "只下載需要的語言，讓應用程式保持輕量。", close: "關閉設定", listLabel: "語言包列表", voiceBeta: "語音 Beta", sizeUnknown: "尚未獲取大小", loading: "正在檢查語言包…", loadFailed: "無法載入語言包列表。",
      status: { current: "目前使用", installed: "已安裝", download: "下載", downloading: "下載中", update: "可更新", deleting: "刪除中", failed: "失敗 · 重試", unavailable: "翻譯準備中" },
      action: { download: "下載", apply: "套用", update: "更新", delete: "刪除", retry: "重試" },
      notice: { downloaded: (name) => `已安裝${name}語言包。`, updated: (name) => `已更新${name}語言包。`, deleted: (name) => `已刪除${name}語言包。`, failed: (name) => `${name}操作失敗，請重試。` },
    },
    motion: { reaction: "反應", verifiedFact: "已驗證事實", suspicion: "懷疑轉移", vote: "投票變化", strong: "強連結", weak: "弱連結", conflict: "紀錄衝突", shifted: (count) => `${count}票轉移`, held: "方向不變", eliminated: "淘汰", exposed: "身分曝光", draw: "暫不裁決" },
    habitatMapTitle: "火星居住區地圖", habitatMapOpen: "手繪筆記", habitatMapAlt: "手繪地圖：氧氣室、管制室、置物櫃與居住艙氣閘通過走廊相連", habitatMapHint: "紅色X標出空氣淨化設備安全單元損壞的位置。", habitatMapLocationsLabel: "地圖地點", habitatMapLocations: ["氧氣室", "管制室", "置物櫃", "居住艙氣閘"],
    contextMedia: { accessCard: "置物櫃中發現的損壞通行卡", controlCamera: "火星標準時22:10的管制室監控紀錄", oxygenRoom: "氧氣室淨化器與感測器紀錄", minaBroadcast: "米娜儲存的地球直播截圖", minaConcert: "火星穹頂演唱會紀錄", junoSensor: "茱諾正在比對的氧氣室感測器", junoRestart: "空氣淨化設備重啟紀錄", noelReaction: "諾艾爾回看的地球直播反應", noelEdit: "諾艾爾正在檢查的直播剪輯" },
    characterArchive: {
      open: (name) => `查看${name}的個人檔案`, profileEyebrow: "MARS.NET 好友資料", profileTitle: (name) => `${name}的個人檔案`, levelLabel: "等級", affinityLabel: "親密度", boardLabel: "常逛論壇", traitsLabel: "推理風格", contactActions: "聯系好友", message: "發訊息", messageAria: (name) => `給${name}發訊息`, call: "通話", callAria: (name) => `呼叫${name}`, viewPosts: (count) => `查看貼文（${count}）`, profileBack: "返回個人檔案", eyebrow: "MARS.NET 匿名活動", title: (name) => `${name}的貼文檔案`, lead: "與此資料相關聯的歷史匿名帖。本人通常堅持說‘不是我’。", close: "關閉好友資料", anonymous: "匿名", author: "原 PO", youAnonymous: "匿名（你）", historyTag: "黑歷史", comments: "留言", commentPlaceholder: "留下匿名留言", commentSend: "發布", sessionOnly: "你的留言只會保留到本次會話結束。", now: "剛剛", replyLoading: "輸入中…", seedTimes: ["一週前", "兩個月前", "三個月前"], dailyTime: (date) => `${date}的訪問紀錄`, dailyMeta: (index) => `${4 + (index % 11)}條留言 · ${38 + (index * 17)}次瀏覽`,
      photoLabel: (name) => `與${name}有關的匿名貼文照片`, videoLabel: (name) => `與${name}有關的匿名貼文短影片`, stickerLabel: (name) => `很有${name}風格的MARS.NET原創反應貼紙`,
      stickerText: { mina: ["證據已儲存", "那就證明啊", "快上圖"], juno: ["依據太弱", "存在反例", "暫緩判斷"], noel: ["剛才看到了", "語氣變了", "回看片段"] },
      ambientComments: {
        mina: ["原影片畫質不錯", "後排這個角度應該也看得見", "多發點演出筆記吧哈哈", "有沒有帶截圖時間的？", "最近穹頂周邊配送都很慢", "分析本身挺有用"],
        juno: ["我們區感測器正常也出現了同一警告", "原始日誌公開後結論可能會變", "重啟前是不是該儲存電力日誌", "這個反例相當有力", "有人對比過其他穹頂的測量值嗎？", "比起結論，我更在意核查順序"],
        noel: ["聊天風向幾秒就反了哈哈", "原始影片在哪？", "比聲音更有意思的是聊天室反應", "回看才發現那個眼神真不對", "不知道有沒有剪，但時機很怪", "下次直播也把這裡存下來"],
      },
      confessionReplies: { mina: "在這裡自爆？截圖了哈哈", juno: "自認並不能完成驗證。先核對通行卡原始紀錄。", noel: "連道歉時的反應我也記了哈哈，那個停頓很關鍵。" },
      evidenceReplies: { mina: "有原始資料就發出來，時間也很重要。", juno: "下結論前先比較原件和反例。", noel: "看原始影片和發帖時間，應該能理清反應順序。" },
      dailyTemplates: {
        mina: [
          { title: "誰有地球直播的原始截圖？", body: "不要糊掉的二傳，我要表情變化的那一幀。", comment: "這儲存習慣也太米娜了", reply: "存截圖的人多了，別亂認人" },
          { title: "這次周邊我絕對不買，真的", body: "占地方，送到穹頂還慢。誰勸都不買。", comment: "那今天的購買紀錄是誰的？", reply: "也許是禮物。先確認事實" },
          { title: "整理了火星穹頂演出的視野", body: "每個看台角度不同。覺得有錯就帶截圖來。", comment: "這張表太像米娜了", reply: "整理座位的人又不止一個。不是米娜" },
        ],
        juno: [
          { title: "別憑居住區警報就認定系統故障", body: "警報與確認故障是兩件事。應先比較感測器原始日誌。", comment: "這寫法完全是茱諾", reply: "別猜作者，驗證說法" },
          { title: "昨天重啟後恢復，原因已確定", body: "錯誤無法複現，因此目前快取故障是最合理的解釋。", comment: "第二天又壞了", reply: "貼文基於當時資料，作者不重要" },
          { title: "更換安全單元前先測一個反例", body: "如果故障假設成立，其他區段日誌也應出現突升。", comment: "除了茱諾誰會這麼寫", reply: "會測反例的人很多，專注證據" },
        ],
        noel: [
          { title: "地球直播聊天室變風向的瞬間", body: "主持人慢了半拍，整片聊天室就變了。反應順序比畫面重要。", comment: "原 PO 是諾艾爾吧", reply: "看反應的人多了哈哈" },
          { title: "這段肯定剪過，不接受反駁", body: "換氣斷點太整齊。如果原直播不是這樣我就認。", comment: "原直播沒剪", reply: "標題寫得強，正文說的是可能" },
          { title: "他說沒事之後那個眼神看到了嗎？", body: "說的話一樣，反應不一樣。看第二遍很明顯。", comment: "諾艾爾又在盯反應", reply: "誰都看得出來，別召喚諾艾爾" },
        ],
      },
      posts: {
        mina: [
          { board: "偶像粉絲論壇", time: "三天前", title: "看到地球直播舞台截圖了嗎？", body: "用0.25倍速看，最後那個笑是真的。我逐幀存了，反駁請帶截圖。", meta: "12條留言 · 84次瀏覽", isHistory: false, comments: [{ author: "匿名1", text: "這種截圖整理也太米娜了哈哈", time: "三天前" }, { author: "原 PO", text: "別什麼都說是米娜？？存截圖的人多了", time: "三天前", isAuthor: true }] },
          { board: "偶像粉絲論壇", time: "一個月前", title: "今晚穹頂演唱會絕對不去", body: "預告剪輯已經讓我受不了。就算有餘票也不去。真的。", meta: "31條留言 · 206次瀏覽", isHistory: true, comments: [{ author: "匿名2", text: "三小時後發現場自拍的是誰來著？", time: "一個月前" }, { author: "原 PO", text: "氣質像的另一個人，不是我", time: "一個月前", isAuthor: true }] },
        ],
        juno: [
          { board: "開發技術論壇", time: "五天前", title: "懷疑淨化器前先檢查氧氣室感測器", body: "警報是事實，淨化器故障是結論。沒有原始日誌就仍是推測。", meta: "8條留言 · 63次瀏覽", isHistory: false, comments: [{ author: "匿名1", text: "這句式完全是茱諾", time: "五天前" }, { author: "原 PO", text: "同一論壇寫法相似很正常。驗證觀點，別認人。", time: "五天前", isAuthor: true }] },
          { board: "開發技術論壇", time: "兩個月前", title: "不是淨化器故障，日誌已確認", body: "更像感測器快取問題，重啟應該能解決。", meta: "19條留言 · 141次瀏覽", isHistory: true, comments: [{ author: "匿名3", text: "第二天不是換了安全單元嗎", time: "兩個月前" }, { author: "原 PO", text: "標題反映當時資料。還有，原 PO 已經不在了。", time: "兩個月前", isAuthor: true }] },
        ],
        noel: [
          { board: "直播論壇", time: "昨天", title: "地球直播聊天室變風向的瞬間", body: "主持人聲音發抖前所有人都說沒事。那一刻聊天室反轉，反應順序比畫面有意思。", meta: "15條留言 · 119次瀏覽", isHistory: false, comments: [{ author: "匿名2", text: "這種反應追蹤是諾艾爾拿手好戲", time: "昨天" }, { author: "原 PO", text: "看反應的人多了，別秒變偵探哈哈", time: "昨天", isAuthor: true }] },
          { board: "直播論壇", time: "三週前", title: "這段100%剪過", body: "斷點太整齊。如果原始影片不一樣我馬上認。", meta: "27條留言 · 244次瀏覽", isHistory: true, comments: [{ author: "匿名4", text: "原始影片出了，沒剪哈哈", time: "三週前" }, { author: "原 PO", text: "100%是標題風格，正文寫的是可能。還有，不是諾艾爾。", time: "三週前", isAuthor: true }] },
        ],
      },
      denialReplies: { mina: ["為什麼所有截圖帖都成米娜了？？只是匿名啊", "拿出我去過的證據。不是我哈哈"], juno: ["猜作者前先驗證反例。", "貼文基於當時資料，但並非茱諾所寫。"], noel: ["口吻相似不代表是同一個人哈哈", "大家都在聊那段，別召喚諾艾爾。"] },
      genericReplies: { mina: ["我也在意這個。有原始資料就補上。", "這個我懂，但還想看別的截圖。", "也許只是喜好不同哈哈"], juno: ["存在這種可能，也比較一下反例。", "就內容而言，這是合理的質疑。", "如果有原始日誌，請更新貼文。"], noel: ["我看到那個反應了哈哈，時機很怪。", "我懂這個解讀，反應確實更早。", "看過原始影片後判斷也許會變。"] },
    },
    level: { label: (level) => `Lv.${level}`, growthTitle: "好友升級", growthDetail: "下一局中，推理與反駁會更敏銳一些。" },
    difficulty: { eyebrow: "可選設定", title: "遊戲難度", names: { normal: "普通", hard: "困難" }, short: { normal: "普通", hard: "HARD" }, descriptions: { normal: "按當前等級遊玩", hard: "約6至7分鐘 · 無草稿 · 三回合質詢 · AI等級+20" }, current: (name) => `已選擇${name}模式 · 可隨時更改` },
    personalQuest: {
      title: "下一局支線任務", inGameLabel: "個人支線任務", accept: "接受", later: "稍後", accepted: "已接受 · 下局生效", inProgress: "進行中", success: "支線任務完成", failure: "支線任務失敗", affinityGain: (score) => `親密度 +${score}`,
      names: { "mina-shift": "改變米娜的判斷", "juno-counterexample": "提出反例", "noel-consistency": "保持說法一致" }, goals: { "mina-shift": "讓米娜從說謊前的判斷到最終投票之間改變票向。", "juno-counterexample": "用有力支持的指控攻擊你栽贓對象以外的人。", "noel-consistency": "維持最初目標，不把反駁轉嫁給別人。" }, reactions: { mina: { success: "咦，真把我的票撬走了哈哈，說到做到嘛。", failure: "我的判斷完全沒變哈哈，下次帶點別的證據。" }, juno: { success: "沒有只依賴一條線索，還驗證了反例。這點我認可。", failure: "方向有可能，但證據鏈還少一環。下次先驗證反例。" }, noel: { success: "從頭到尾同一個人。這次說法能對上哈哈。", failure: "最開始和中途換人了吧。以為我看不出來？哈哈" } },
    },
    journal: {
      title: "偽裝職業調查日誌", progress: (count) => `已在不同日期完成${count}/5次`, next: (name) => `下一條線索：今天完成一局並和${name}複盤 · 每天一條，共五個不同日期`, todayComplete: "今天的線索已獲得。請在另一天再完成一局以繼續。", complete: "私家偵探調查完成", clueAwarded: "獲得今日線索", unlock: "解鎖偽裝職業：私家偵探", locked: "尚未解鎖的偽裝職業", groupName: "三位朋友", cluesOpen: "查看已收集線索", clueTitles: ["上鎖的剪影", "職業物品", "部分能力", "優勢與限制", "朋友們的結論"],
      clueBodies: [(name) => `${name}在儲存紀錄中發現長風衣的剪影。`, (name) => `${name}指出袖珍筆記本和用舊的放大鏡是下一條線索。`, (name) => `${name}推測這個職業能讀出某人當前懷疑的對象。`, (name, outcome, selected) => `${name}從上一局“${outcome} · ${selected}”的結果判斷：它能提前獲取資訊，但之後的攻擊會受限制。`, () => "米娜、茱諾和諾艾爾合並了線索。偽裝職業是私家偵探。"],
    },
    detective: { jobTitle: "偽裝職業 · 私家偵探", equip: "裝備私家偵探", playBasic: "不使用偽裝職業", equipped: "本局已裝備", basic: "正在使用基礎狀態", abilityTitle: "私家偵探調查", abilityLead: "揭示一人當前懷疑的對象，但你不能直接指控被調查者。", choose: "選擇一人", inspect: (name) => `調查${name}`, revealed: (name, target) => `${name}目前懷疑${target}。`, blocked: "已調查 · 無法直接指控", cannotAccuse: (name) => `${name}已被調查，本局無法直接指控。` },
    friendChatFallback: "自動重連仍然失敗，本次回應由離線模式生成。下一條訊息會再次嘗試即時連接。",
    friendGreetings: { record: ["啊，你來了哈哈，我剛整理截圖休息一下。", "正好有空。你剛才在做什麼？", "來了啊。遊戲或閒聊都可以，我聽著。"], skeptic: ["嗨。不用先有結論，隨便聊。", "我現在有空。你在想什麼？", "上線，聽著呢。遊戲以外也能聊哈哈。"], behavior: ["哦，來了。時機不錯哈哈，剛才在做什麼？", "沒想到你會私聊，不過我在。怎麼了？", "看到你上線了哈哈。今天狀態幾分？"] },
    selected: "✓ 已選擇", select: "選擇", stages: { evidence: "放置證據", facts: "確認事實", lie: "聊天指控", challenge: "聊天回應", meetingEnd: "會議結束", result: "投票結果" }, incidentHappened: "案件發生", secretMessage: "私密訊息 · 僅你可見", factMarks: { alibi: "監控", access: "工具", contradiction: "時間" }, evidenceMark: "證據", subquestLabel: "支線任務！", subquestOptional: "可選挑戰 · 失敗無懲罰", subquestSuccess: "支線任務完成！", subquestMissed: "支線任務失敗", subquestSuccessDetail: "目標完成。下一局會出現新挑戰。", subquestMissedDetail: "不影響主線結果。下一局嘗試其他挑戰。",
    evidencePrompt: "要把這張卡放進誰的置物櫃？", evidenceGroup: "要栽贓的夥伴", plant: (name) => `栽贓${name}`, chooseOne: "選擇一位夥伴", evidenceFound: "發現假證據", meetingTitle: (name) => `在${name}的置物櫃裡<br />發現了通行卡。`, roundFacts: "以下三項事實僅適用於本局。", publicFacts: "本局公開事實", clueCount: (count) => `${count}條線索`, openingStatements: "閱讀夥伴開場發言", makeLie: "開啟遊戲房間聊天", yourTurn: "輪到你", chatAccuseTitle: "用自己的話栽贓一個人。", chatAccuseLead: "輸入姓名和理由。快捷草稿為可選項，可自由修改。", chatHardAccuseLead: "請自行輸入姓名和理由。困難模式不提供草稿。", chatReplyTitle: "親自回應反駁。", chatReplyLead: "堅持指控、拉回被放置的卡，或要求重新核對紀錄。",
    hardTurn: (current, total) => `長會議 · 質詢 ${current}/${total}`, hardReplyTitles: ["回應第一回合反駁。", "回應全部三回合質詢。", "投票前陳述最終主張。"], hardReplyLeads: ["別忘記最初目標和公開事實。", "更換目標或與事實衝突會加深懷疑。", "發送這條訊息後立即開始投票。"], hardInterpreted: (target, claim, response) => `遊戲解析 · 目標 ${target} · 指控 ${claim} · 回應 ${response}`, hardFinalSubmitted: "最終辯護已發送，即將開始投票。",
    hardPracticeChallenge: (personality, target, fact, changed, conflict, round) => { if (personality === "record") { if (conflict) return `等等。公開紀錄是“${fact}”，與你的指控對不上。`; if (changed) return `紀錄中最初目標不是這個人，為什麼改成${target}？`; return `第${round}輪質詢已紀錄。再給一個基於紀錄懷疑${target}的理由。`; } if (personality === "skeptic") { if (conflict) return "該指控與公開事實不能同時成立。先回應反例。"; if (changed) return "如果更換目標，就說明之前的假設為何失效。"; return `還需要一個能排除${target}以外可能性的理由。`; } if (changed) return `最開始是別人，現在又是${target}？這個轉向很顯眼。`; if (conflict) return "公開事實已經否定你，你語氣還沒變。解釋一下。"; return `你一直懷疑${target}，別只靠語氣，拿出證據。`; },
    chatRoomTitle: "遊戲房間 #041", chatTranscriptAria: "黑手黨遊戲房間聊天", chatSuggestions: "快捷草稿", chatSuggestionsHint: "插入後可自由修改", relationStrong: "強線索連接", relationWeak: "弱關聯", relationConflict: "與事實矛盾", chatInputLabel: "訊息", chatPlaceholderAccuse: "例：諾艾爾動過淨化器，工具也能證明。", chatPlaceholderReply: "例：再核對一次22:10前後的紀錄。", chatSend: "發送", chatLength: (count) => `最多${count}字`, chatTyping: "朋友正在閱讀…", chatTypingPerson: (name) => `${name}正在輸入…`, chatModeLive: "朋友即時回應", chatModeMock: "離線練習回應", chatFallback: "自動重連仍然失敗，本回合已使用離線模式。下一條訊息會再次嘗試即時連接。", chatYou: "你", chatYouMark: "我", chatNow: "剛剛", freeChat: "自由輸入", chatInterpretedLie: (target, claim) => `遊戲解析 · 目標 ${target} · 主要依據 ${claim}`, chatInterpretedResponse: (text) => `遊戲解析 · 主要回應“${text}” · 其餘細節保留原文`,
    chatPracticeReaction: (personality, name, variant) => ({ record: [`按紀錄看，現在${name}最可疑。`, `等等，時間線仍然指向${name}。`, `確認過了，${name}的說法最不符合紀錄。`], skeptic: [`只看事實，${name}仍是最大嫌疑。`, `排除推測後，${name}還是需要解釋。`, `其他可能也測過了，還是${name}。`], behavior: [`${name}的反應一直讓我在意，現在就盯這裡。`, `大家看到${name}剛才那個轉向了嗎？`, `我選${name}。那個反應不能忽略。`] })[personality][variant % 3],
    chatPracticeDecision: (personality, name, variant) => ({ record: [`我選${name}，紀錄指向那裡。`, `順著時間線，投票對象就是${name}。`, `已儲存紀錄。我投${name}。`], skeptic: [`即使排除推測，${name}仍最可疑。`, `只留下確定事實，結果就是${name}。`, `反例也查過了，${name}仍最符合。`], behavior: [`${name}。最後的反應讓我確定了。`, `看完最後回應，我投${name}。`, `${name}的語氣變了好幾次，就投這裡。`] })[personality][variant % 3],
    friendPracticeReply: (personality, variant, message) => ({ record: [`“${message}”這句我存了哈哈，再說點。`, `明白。“${message}”是你最想說的嗎？`, `我在整理。“${message}”最讓我在意。`], skeptic: [`明白。“${message}”更接近事實還是感受？`, `有這種可能。你為什麼會得出“${message}”？`, `知道了。想過其他解釋嗎？`], behavior: [`你說“${message}”的語氣，一看就有事哈哈`, `聽語氣，你比自己以為的更在意。`, `嗯，聽得出來你就是想聊這個。繼續。`] })[personality][variant % 3],
    audioStart: "播放背景音樂", audioMute: "背景音樂靜音", audioUnmute: "開啟背景音樂", audioVolume: "背景音樂音量", audioVoiceMuted: "語音通話期間背景音樂已靜音", debriefOpen: "查看賽後好友聊天", debriefRequest: "三個人聊聊剛結束的遊戲。", debriefTitle: "正在複盤上一局", debriefLead: "朋友們記得剛才的選擇和結果。", debriefSummary: "上一局", debriefOutcome: { win: "勝利", lose: "身份暴露", draw: "平局" }, debriefNoSelection: "無人被選中", debriefRoundLine: (planted, accused, selected) => `你栽贓了${planted}，指控了${accused}，最終${selected}被選中。`, debriefFallback: "自動重連仍然失敗，現顯示基於角色性格生成的離線對話。下一次請求會再次嘗試即時連接。", debriefHome: "主頁",
    debriefPractice: { record: (selected) => `最後票都流向${selected}的過程值得存檔哈哈`, skeptic: (accused) => `我理解懷疑${accused}的理由。下次也測一下反例。`, behavior: (outcome) => `“${outcome}”出來那刻氣氛都變了哈哈，下局也挺期待。` }, chatDecisionTitle: "房間已經形成結論。", chatDecisionLead: "公開投票前，先查看聊天中的懷疑如何變化。", yourResponse: "你的最終回應", preVoteAria: "投票前各夥伴的判斷", showVote: "公開投票結果", voteShiftAria: "說謊前後的判斷變化", beforeAfter: "說謊前 → 最終判斷", changed: "票向已改變", unchanged: "維持原判斷", resultAria: "夥伴投票及理由", nextRoundTitle: "下一局：新事實與支線任務", nextRoundDetail: "朋友不變，但線索變化會帶來不同反應。", restart: "使用新事實開始下一局",
    result: {
      tiers: { mastermind: "完美誤導 · ★★★", manipulator: "操縱票向 · ★★", survivor: "避開懷疑 · ★" }, drawEyebrow: "投票無效", loseEyebrow: "身份暴露", drawTitle: "無人被淘汰。", winTitle: (name) => `${name}被淘汰`, loseTitle: "你被淘汰。", drawDescription: "三票分散。你保住了身份，但沒能淘汰任何人。", shiftedDescription: (count) => `你的選擇帶動了${count}票。`, safeDescription: "票向沒有改變，但懷疑也沒有集中到你身上。", loseDescription: "其他玩家發現了你說法中的矛盾。", drawWhy: "為什麼投票無效？", shiftWhy: "什麼改變了票向？", safeWhy: "為什麼避開了懷疑？", loseWhy: "為什麼身份暴露？", drawExplanation: "三個人分別投給不同對象，沒有任何人達到兩票多數。", loseExplanation: "你的指控與事實矛盾或多次改變，懷疑最終回到你身上。", redirectedExplanation: (name, count) => `你把票從被栽贓者引向了${name}。最終判斷中有${count}項與說謊前不同。`, safeExplanation: "被放置的通行卡本身就製造了足夠懷疑，讓你安全獲勝，沒有新增票向變化。", shiftedExplanation: (count) => `被放置的卡和之後的說法改變了${count}項最終判斷。`, splitExplanation: "夥伴判斷分散，但你以外的某人獲得了最高票。",
    },
  },
  friendRoom: {
    meta: {
      title: "MARS.NET · 好友房間", back: "返回單人首頁", language: "語言",
      themeControl: (name) => `顯示模式：${name}。按一下切換`,
      themes: { system: "自動", light: "淺色", dark: "深色" },
      audio: { start: "播放背景音樂", mute: "關閉背景音樂", unmute: "開啟背景音樂", volume: "背景音樂音量" },
    },
    entry: {
      eyebrow: "雙人即時遊戲", title: "和好友來一局黑手黨？", lead: "分享連結，與兩位火星居民好友一起遊玩。",
      create: "建立房間", join: "輸入代碼加入", code: "房間代碼", codePlaceholder: "6位代碼", name: "顯示名稱", namePlaceholder: "1至12個字元", avatar: "內建頭像", submitCreate: "建立房間", submitJoin: "加入房間", privacy: "上傳的個人頭像不會分享給其他人。",
    },
    connection: { connected: "已連線", reconnecting: "正在重新連線…", disconnected: "連線已中斷", expired: "房間已過期。", end: "結束房間" },
    lobby: { eyebrow: "MARS.NET 私人房間", title: "正在等待好友", code: "房間代碼", copy: "複製邀請連結", copied: "已複製", ready: "準備完成", cancelReady: "取消準備", waiting: "正在等待第二位玩家…", player: "真人玩家", character: "MARS.NET 火星居民", rotation: "兩位火星居民好友每局輪替。" },
    role: { eyebrow: "只有自己看得到的秘密身分", mafia: "你是黑手黨。", citizen: "你是平民。", mafiaLead: "利用假證據與聊天，讓另一位參與者獲得兩票。", citizenLead: "閱讀聊天與公開事實，找出黑手黨。你的最終選擇算一票。", confirm: "確認身分", wait: "正在等待對方確認身分…" },
    plant: { title: "放置假證據。", lead: "選一個置物櫃，放入損壞的通行卡。", wait: "黑手黨正在準備事件…", action: (name) => `栽贓${name}` },
    facts: { eyebrow: "公開事實", title: "火星標準時間22:10 · 氧氣室", lead: "淨化器安全裝置故障。透過聊天找出誰在說謊。", confirm: "確認事實並開啟聊天", wait: "正在等待對方確認事實…" },
    chat: { title: "即時推理聊天", lead: "兩位真人玩家的發言會影響實際懷疑判斷。", placeholder: "說說你懷疑誰，以及理由", send: "傳送", typing: (name) => `${name}正在輸入…`, voteTitle: "平民最終投票", voteLead: "你的一票會和兩位火星居民的票合併計算。", vote: (name) => `投票給${name}`, mafiaWait: "平民正在選擇最終投票。", emoji: "表情符號" },
    result: {
      mafiaWin: "黑手黨獲勝", mafiaLoss: "平民獲勝", draw: "投票無效", selected: (name) => `${name}獲得至少兩票。`, drawLead: "票數分成1–1–1，沒有人出局。", roles: "公開身分", votes: "最終投票", reasonManual: "真人平民直接選擇的一票", reasonEvidence: "綜合公開事實與已驗證聊天作出判斷",
      reactions: {
        mafia_win: { mina: "剛才那波票數變化我截圖了，這局算你厲害。", juno: "聊天走向壓過了假證據。下一局先檢查反例。", noel: "看到最後氣氛怎麼翻了嗎？時機抓得不錯。" },
        mafia_loss: { mina: "你的說法和紀錄對不上時，我馬上就看出來了。下局記得講圓。", juno: "有一項主張和公開事實衝突。下次把假設驗證到底。", noel: "你中途反應變了，很明顯。下局把說法維持一致。" },
        draw: { mina: "三票全部分開也太誇張了，這局得存下來。", juno: "證據指向三個方向，無法形成結論。值得再來一局。", noel: "到最後大家都沒定下來。再玩一局應該能看出來。" },
      },
      rematch: "交換身分再來一局", rematchWaiting: "正在等待對方準備重賽…",
    },
    errors: { generic: "無法處理此要求。", stale_event: "房間狀態已變更，已還原最新狀態。", rapid_duplicate: "不能立即重複傳送相同訊息。", room_expired: "房間已過期。", room_full: "此房間已滿。", invalid_locale: "暫不支援此語言。" },
  },
  account: {
    guest: "訪客 · 儲存在此裝置", signedIn: "正在儲存至雲端", saved: "已儲存至雲端", syncing: "正在同步", pending: "等待同步",
    saveTitle: "將紀錄儲存至帳號", saveLead: "登入後即可在其他裝置延續成長進度、對局紀錄與私人聊天。", saveAction: "登入並儲存紀錄",
    accountTitle: "MARS.NET 帳號", loginLead: "你仍可繼續以訪客身分遊玩。登入後會安全合併此裝置的紀錄。", google: "使用Google繼續", email: "使用電子郵件繼續", guestAction: "以訪客身分開始",
    authEyebrow: "2050 · MARS.NET", authTitle: "好友正在火星等你", authLead: "登入並延續紀錄，或直接以訪客身分開始。", authLoading: "正在檢查帳號連線…", guestNote: "不需註冊即可開始。進度會儲存在此裝置。",
    privacyPolicy: "隱私權政策", termsOfService: "服務條款", emailLoginTitle: "使用電子郵件登入", emailSignupTitle: "建立MARS.NET帳號", emailResetTitle: "重設密碼", recoveryTitle: "設定新密碼",
    emailLabel: "電子郵件", passwordLabel: "密碼", passwordConfirmLabel: "確認密碼", passwordHint: "請輸入至少8個字元。", emailPlaceholder: "you@example.com",
    loginAction: "登入", signupAction: "建立帳號", resetAction: "傳送重設郵件", updatePasswordAction: "儲存新密碼", forgotPassword: "忘記密碼？", createAccount: "第一次來？建立帳號", existingAccount: "已有帳號？登入", back: "返回",
    confirmationSent: "驗證郵件已寄出。完成驗證後請登入。", resetSent: "如果此地址已註冊，重設郵件將寄至你的信箱。", passwordUpdated: "密碼已更新。", invalidEmail: "請輸入有效的電子郵件地址。", passwordMismatch: "兩次輸入的密碼不一致。", authError: "請檢查登入資料，或稍後再試。",
    providerGoogle: "Google", providerEmail: "電子郵件", unavailable: "雲端儲存尚未設定。遊戲仍會儲存在此裝置。", connected: "已連接的登入方式", lastSync: "上次同步", never: "尚無", export: "將所有紀錄匯出為JSON", deleteChats: "依角色刪除聊天", deleteChat: (name) => `刪除與${name}的聊天`, logout: "登出", deleteAccount: "刪除帳號與雲端紀錄", feedback: "傳送意見或問題給創作者", close: "關閉帳號視窗",
    confirmChatDelete: "刪除與此角色的所有已儲存聊天？此操作無法復原。", confirmAccountDelete: "刪除帳號、成長紀錄、對局紀錄、私人聊天與頭像？此操作無法復原。", reauth: "為了安全，請重新登入後再刪除帳號。", error: "雲端連線失敗。你仍可繼續在本機遊玩。",
    characters: { mina: "米娜", juno: "茱諾", noel: "諾艾爾" },
  },
};

let staging = globalThis[STAGING_KEY];
if (!staging) {
  staging = new Map();
  globalThis[STAGING_KEY] = staging;
}
staging.set("zh-TW", { schemaVersion: PACK_SCHEMA_VERSION, version: PACK_VERSION, pack });

export default pack;
