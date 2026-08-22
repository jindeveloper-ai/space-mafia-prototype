const language = new URLSearchParams(window.location.search).get("lang") === "en" ? "en" : "ko";

if (window.location.protocol === "file:") {
  const notice = document.querySelector("#file-protocol-notice");
  const copy = language === "en"
    ? {
        title: "Opening the app as a file is not supported.",
        body: "Run the local server so profiles, chat, and the API proxy work securely.",
        link: "Open the app after starting the server",
      }
    : {
        title: "직접 파일 실행은 지원하지 않습니다.",
        body: "프로필·채팅·API 보안을 위해 로컬 서버로 실행해 주세요.",
        link: "서버 실행 후 앱 열기",
      };
  document.documentElement.lang = language;
  document.querySelector(".page-shell").hidden = true;
  notice.hidden = false;
  notice.querySelector("[data-file-notice-title]").textContent = copy.title;
  notice.querySelector("[data-file-notice-body]").textContent = copy.body;
  notice.querySelector("[data-file-notice-link]").textContent = copy.link;
  notice.querySelector("[data-file-notice-link]").href = `http://127.0.0.1:4173/?lang=${language}`;
} else {
  void import("./game.js?v=0.17.2");
}
