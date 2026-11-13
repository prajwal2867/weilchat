const socket = io({
  path: "/api/socket-io",
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
let adultConfirmed = false;
function show(name){for(const id of screens)$(id).classList.toggle("hidden",id!==name);document.body.classList.toggle("searching-mode",name==="searching");document.body.classList.toggle("chat-mode",name==="chat");if(name!=="chat")closeProfileMenu()}
function closeProfileMenu(){$("profile-menu").classList.add("hidden");$("profile-button").setAttribute("aria-expanded","false")}
function setConnection(connected){$("connection-label").textContent=connected?"ONLINE":"RECONNECTING";document.querySelector(".header-meta .live-dot").style.background=connected?"#9c78f4":"#888"}
function addMessage(text,mine=false,timestamp=Date.now()){
  const row=document.createElement("article");row.className="message-row"+(mine?" mine":"");
  const avatar=document.createElement("span");avatar.className="message-avatar";avatar.setAttribute("aria-hidden","true");avatar.innerHTML='<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.5"/><path d="M5.5 20a6.5 6.5 0 0 1 13 0"/></svg>';
  const content=document.createElement("div");content.className="message-content";
  const bubble=document.createElement("div");bubble.className="message-bubble";
  const body=document.createElement("p");body.textContent=text;bubble.append(body);
  const footer=document.createElement("div");footer.className="message-footer";
  const time=document.createElement("time");time.className="message-time";time.dateTime=new Date(timestamp).toISOString();time.textContent=new Date(timestamp).toLocaleTimeString([],{hour:"numeric",minute:"2-digit"});
  footer.append(time);
  if(mine){const sent=document.createElement("span");sent.className="message-sent";sent.setAttribute("aria-label","Sent");sent.textContent="✓";footer.append(sent)}
  content.append(bubble,footer);
  if(mine)row.append(content,avatar);else row.append(avatar,content);
  $("messages").append(row);$("messages").scrollTop=$("messages").scrollHeight;
}
function startMatch(){
  if(!socket.connected){$("search-status").textContent="Reconnecting to the chat server...";show("searching");return}
  const gender=document.querySelector('input[name="gender"]:checked').value;
  socket.emit("find-match",{gender,preference:gender==="man"?"woman":"man",adult:adultConfirmed});matched=false;show("searching");
}
function requestMatch(){if(adultConfirmed)startMatch();else $("adult-dialog").showModal()}
$("start-form").addEventListener("submit",event=>{event.preventDefault();requestMatch()});
$("confirm-adult").addEventListener("click",()=>{adultConfirmed=true;startMatch()});
$("profile-button").addEventListener("click",()=>{const open=$("profile-menu").classList.toggle("hidden")===false;$("profile-button").setAttribute("aria-expanded",String(open))});
document.querySelectorAll(".chat-nav-item").forEach(item=>item.addEventListener("click",()=>{document.querySelectorAll(".chat-nav-item").forEach(navItem=>{navItem.classList.remove("active");navItem.removeAttribute("aria-current")});item.classList.add("active");item.setAttribute("aria-current","page")}));
document.querySelectorAll(".recent-chat").forEach(item=>item.addEventListener("click",()=>{document.querySelectorAll(".recent-chat").forEach(chat=>{chat.classList.remove("active");chat.removeAttribute("aria-current")});item.classList.add("active");item.setAttribute("aria-current","page");$("chat-title").textContent=item.dataset.chatTitle}));
$("clear-recent").addEventListener("click",()=>{$("recent-chat-list").replaceChildren()});
$("cancel-search").addEventListener("click",()=>{autoRematch=false;socket.emit("next");show("welcome")});
$("again-button").addEventListener("click",requestMatch);
$("message-form").addEventListener("submit",event=>{event.preventDefault();const input=$("message-input");const text=input.value.trim();if(!text||!matched)return;socket.emit("chat-message",{text});addMessage(text,true);input.value="";input.focus()});
$("report-button").addEventListener("click",()=>{closeProfileMenu();$("report-dialog").showModal()});
$("next-button").addEventListener("click",()=>{closeProfileMenu();autoRematch=true;socket.emit("next");show("searching");$("search-status").textContent="Finding your next conversation..."});
$("submit-report").addEventListener("click",event=>{event.preventDefault();const reason=document.querySelector('input[name="reason"]:checked').value;socket.emit("report",{reason});$("report-dialog").close();$("chat-status").textContent="Thanks. Your report has been submitted."});
socket.on("connect",()=>{clearTimeout(reconnectTimer);setConnection(true);if(!$("searching").classList.contains("hidden"))startMatch()});
socket.on("disconnect",()=>{setConnection(false);if(matched){matched=false;show("ended");$("chat-status").textContent="Connection interrupted. Start a new chat when you're ready."}});
socket.on("matched",()=>{clearTimeout(reconnectTimer);matched=true;$("messages").replaceChildren();$("chat-status").textContent="You're connected. Say hello.";show("chat");$("message-input").focus()});
socket.on("chat-message",message=>addMessage(message.text,false,message.timestamp));
socket.on("partner-left",()=>{matched=false;$("chat-status").textContent="The stranger has left the conversation.";show("ended")});
socket.on("chat-reset",()=>{matched=false;$("messages").replaceChildren();if(autoRematch){autoRematch=false;startMatch()}else show("welcome")});
socket.on("report-received",()=>{$("chat-status").textContent="Report received. Thanks for helping keep Weilchat safer."});
socket.on("chat-error",message=>{if(!$("chat").classList.contains("hidden"))$("chat-status").textContent=message;else $("search-status").textContent=message});
