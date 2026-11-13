import { preferenceForGender } from "./matchmaking.js";
import { SOCKET_PATH } from "./socket-config.js";

const socket = io({
  path: SOCKET_PATH,
  addTrailingSlash: false,
  transports: ["websocket"],
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 800,
  reconnectionDelayMax: 8000,
  timeout: 12000
});
const $ = (id) => document.getElementById(id);
const screens = ["welcome", "searching", "chat", "ended"];
let matched = false;
let reconnectTimer;
let autoRematch = false;
const ADULT_CONFIRMATION_KEY = "weilchat:adult-confirmed:v1";
let adultConfirmed = localStorage.getItem(ADULT_CONFIRMATION_KEY) === "true";
let reportPending = false;
function show(name){for(const id of screens)$(id).classList.toggle("hidden",id!==name);document.body.classList.toggle("searching-mode",name==="searching");document.body.classList.toggle("chat-mode",name==="chat");if(name!=="chat")closeProfileMenu()}
function closeProfileMenu(){$("profile-menu").classList.add("hidden");$("profile-button").setAttribute("aria-expanded","false");$("profile-button").setAttribute("aria-label",matchMedia("(max-width: 760px)").matches?"Open chat menu":"Conversation options")}
function syncChatViewport(){
  if(!matchMedia("(max-width: 760px)").matches||!document.body.classList.contains("chat-mode"))return;
  const viewport=window.visualViewport;
  const height=viewport?viewport.height:window.innerHeight;
  const top=viewport?viewport.offsetTop:0;
  const keyboardOpen=!!viewport&&window.innerHeight-height>120;
  document.body.classList.toggle("keyboard-open",keyboardOpen);
  document.documentElement.style.setProperty("--chat-visible-height",`${Math.round(height)}px`);
  document.documentElement.style.setProperty("--chat-visible-top",`${Math.round(top)}px`);
}
window.visualViewport?.addEventListener("resize",syncChatViewport,{passive:true});
window.visualViewport?.addEventListener("scroll",syncChatViewport,{passive:true});
window.addEventListener("resize",syncChatViewport,{passive:true});
window.addEventListener("orientationchange",syncChatViewport,{passive:true});
const viewportObserver=new MutationObserver(syncChatViewport);
viewportObserver.observe(document.body,{attributes:true,attributeFilter:["class"]});
function setConnection(connected){$("connection-label").textContent=connected?"ONLINE":"RECONNECTING";document.querySelector(".header-meta .live-dot").style.background=connected?"#9c78f4":"#888"}
function addMessage(text,mine=false){
  const row=document.createElement("article");row.className="message-row"+(mine?" mine":"");
  const avatar=document.createElement("span");avatar.className="message-avatar";avatar.setAttribute("aria-hidden","true");avatar.innerHTML='<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.5"/><path d="M5.5 20a6.5 6.5 0 0 1 13 0"/></svg>';
  const content=document.createElement("div");content.className="message-content";
  const bubble=document.createElement("div");bubble.className="message-bubble";
  const body=document.createElement("p");body.textContent=text;bubble.append(body);
  content.append(bubble);
  if(mine)row.append(content,avatar);else row.append(avatar,content);
  $("messages").append(row);$("messages").scrollTop=$("messages").scrollHeight;
}
function startMatch(){
  if(!socket.connected){$("search-status").textContent="Reconnecting to the chat server...";show("searching");return}
  const gender=document.querySelector('input[name="gender"]:checked').value;
  socket.emit("find-match",{gender,preference:preferenceForGender(gender),adult:adultConfirmed});matched=false;show("searching");
}
function requestMatch(){if(adultConfirmed)startMatch();else $("adult-dialog").showModal()}
$("start-form").addEventListener("submit",event=>{event.preventDefault();requestMatch()});
$("confirm-adult").addEventListener("click",()=>{adultConfirmed=true;localStorage.setItem(ADULT_CONFIRMATION_KEY,"true");startMatch()});
$("profile-button").addEventListener("click",()=>{const open=$("profile-menu").classList.toggle("hidden")===false;$("profile-button").setAttribute("aria-expanded",String(open));$("profile-button").setAttribute("aria-label",open&&matchMedia("(max-width: 760px)").matches?"Close chat menu":matchMedia("(max-width: 760px)").matches?"Open chat menu":"Conversation options")});
document.addEventListener("click",event=>{if(!$("profile-menu").classList.contains("hidden")&&!$("profile-menu").contains(event.target)&&!$("profile-button").contains(event.target))closeProfileMenu()});
document.addEventListener("keydown",event=>{if(event.key==="Escape"&&!$("profile-menu").classList.contains("hidden"))closeProfileMenu()});
// Reuse the sidebar content in the mobile overflow menu without changing desktop navigation.
const mobileSidebarMenu=$("mobile-sidebar-menu");
mobileSidebarMenu.innerHTML=$("chat").querySelector(".chat-sidebar").innerHTML;
mobileSidebarMenu.querySelectorAll("[id]").forEach(element=>element.removeAttribute("id"));
mobileSidebarMenu.querySelectorAll("a").forEach(link=>{link.removeAttribute("href");link.setAttribute("role","button")});
mobileSidebarMenu.querySelectorAll(".recent-chat").forEach(item=>item.setAttribute("type","button"));
mobileSidebarMenu.querySelectorAll(".recent-chats-heading button").forEach(button=>button.dataset.mobileClearRecent="true");
mobileSidebarMenu.addEventListener("click",event=>{
  const clearButton=event.target.closest("[data-mobile-clear-recent]");
  if(clearButton){$("recent-chat-list").replaceChildren();mobileSidebarMenu.querySelector(".recent-chat-list")?.replaceChildren();return}
  const navItem=event.target.closest(".chat-nav-item");
  if(navItem){mobileSidebarMenu.querySelectorAll(".chat-nav-item").forEach(item=>{item.classList.remove("active");item.removeAttribute("aria-current")});navItem.classList.add("active");navItem.setAttribute("aria-current","page");closeProfileMenu();return}
  const recentItem=event.target.closest(".recent-chat");
  if(recentItem){mobileSidebarMenu.querySelectorAll(".recent-chat").forEach(item=>{item.classList.remove("active");item.removeAttribute("aria-current")});recentItem.classList.add("active");recentItem.setAttribute("aria-current","page");$("chat-title").textContent=recentItem.dataset.chatTitle;closeProfileMenu();return}
  if(event.target.closest(".promo-link"))closeProfileMenu();
});
document.querySelectorAll(".chat-nav-item").forEach(item=>item.addEventListener("click",()=>{document.querySelectorAll(".chat-nav-item").forEach(navItem=>{navItem.classList.remove("active");navItem.removeAttribute("aria-current")});item.classList.add("active");item.setAttribute("aria-current","page")}));
document.querySelectorAll(".recent-chat").forEach(item=>item.addEventListener("click",()=>{document.querySelectorAll(".recent-chat").forEach(chat=>{chat.classList.remove("active");chat.removeAttribute("aria-current")});item.classList.add("active");item.setAttribute("aria-current","page");$("chat-title").textContent=item.dataset.chatTitle}));
$("clear-recent").addEventListener("click",()=>{$("recent-chat-list").replaceChildren()});
$("cancel-search").addEventListener("click",()=>{autoRematch=false;socket.emit("next");show("welcome")});
$("again-button").addEventListener("click",requestMatch);
$("message-form").addEventListener("submit",event=>{event.preventDefault();const input=$("message-input");const text=input.value.trim();if(!text||!matched)return;socket.emit("chat-message",{text});addMessage(text,true);input.value="";input.focus()});
$("report-button").addEventListener("click",()=>{closeProfileMenu();$("report-dialog").showModal()});
$("next-button").addEventListener("click",()=>{closeProfileMenu();autoRematch=true;socket.emit("next");show("searching");$("search-status").textContent="Finding your next conversation..."});
$("submit-report").addEventListener("click",event=>{event.preventDefault();if(reportPending)return;const reason=document.querySelector('input[name="reason"]:checked').value;reportPending=true;$("submit-report").disabled=true;$("chat-status").textContent="Submitting your report...";socket.emit("report",{reason});});
socket.on("connect",()=>{clearTimeout(reconnectTimer);setConnection(true);if(!$("searching").classList.contains("hidden"))startMatch()});
socket.on("disconnect",()=>{setConnection(false);if(matched){matched=false;show("ended");$("chat-status").textContent="Connection interrupted. Start a new chat when you're ready."}});
socket.on("matched",()=>{clearTimeout(reconnectTimer);matched=true;$("messages").replaceChildren();$("chat-status").textContent="You're connected. Say hello.";show("chat")});
socket.on("chat-message",message=>addMessage(message.text,false));
socket.on("partner-left",()=>{matched=false;$("chat-status").textContent="The stranger has left the conversation.";show("ended")});
socket.on("chat-reset",()=>{matched=false;$("messages").replaceChildren();if(autoRematch){autoRematch=false;startMatch()}else show("welcome")});
socket.on("report-received",()=>{reportPending=false;$("submit-report").disabled=false;$("report-dialog").close();$("chat-status").textContent="Report received. Thanks for helping keep Weilchat safer.";});
socket.on("chat-error",message=>{if(reportPending){reportPending=false;$("submit-report").disabled=false;}if(!$("chat").classList.contains("hidden"))$("chat-status").textContent=message;else $("search-status").textContent=message});
