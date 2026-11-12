const socket = io({
  path: "/api/socket-io/socket.io",
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
function show(name){for(const id of screens)$(id).classList.toggle("hidden",id!==name)}
function setConnection(connected){$("connection-label").textContent=connected?"ONLINE":"RECONNECTING";document.querySelector(".header-meta .live-dot").style.background=connected?"#d6d6d6":"#888"}
function addMessage(text,mine=false,timestamp=Date.now()){
  const row=document.createElement("article");row.className="message"+(mine?" mine":"");
  const meta=document.createElement("span");meta.className="message-meta";meta.textContent=(mine?"YOU":"STRANGER")+" / "+new Date(timestamp).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"});
  const body=document.createElement("p");body.textContent=text;row.append(meta,body);$("messages").append(row);$("messages").scrollTop=$("messages").scrollHeight;
}
function startMatch(){
  if(!socket.connected){$("search-status").textContent="Reconnecting to the chat server...";show("searching");return}
  const gender=document.querySelector('input[name="gender"]:checked').value;
  socket.emit("find-match",{gender,preference:gender==="man"?"woman":"man",adult:$("adult-check").checked});matched=false;show("searching");
}
document.querySelectorAll('input[name="gender"]').forEach(radio=>radio.addEventListener("change",()=>{$("match-target").textContent=radio.value==="man"?"WOMEN":"MEN"}));
$("start-form").addEventListener("submit",event=>{event.preventDefault();if($("adult-check").checked)startMatch()});
$("cancel-search").addEventListener("click",()=>{autoRematch=false;socket.emit("next");show("welcome")});
$("again-button").addEventListener("click",startMatch);
$("next-button").addEventListener("click",()=>{autoRematch=true;socket.emit("next");show("searching");$("search-status").textContent="Finding your next conversation..."});
$("message-form").addEventListener("submit",event=>{event.preventDefault();const input=$("message-input");const text=input.value.trim();if(!text||!matched)return;socket.emit("chat-message",{text});addMessage(text,true);input.value="";input.focus()});
$("report-button").addEventListener("click",()=>$("report-dialog").showModal());
$("submit-report").addEventListener("click",event=>{event.preventDefault();const reason=document.querySelector('input[name="reason"]:checked').value;socket.emit("report",{reason});$("report-dialog").close();$("chat-status").textContent="Thanks. Your report has been submitted."});
socket.on("connect",()=>{clearTimeout(reconnectTimer);setConnection(true);if(!$("searching").classList.contains("hidden"))startMatch()});
socket.on("disconnect",()=>{setConnection(false);if(matched){matched=false;show("ended");$("chat-status").textContent="Connection interrupted. Start a new chat when you're ready."}});
socket.on("waiting",()=>{$("search-status").textContent="No one is available yet. We'll connect you as soon as someone joins."});
socket.on("matched",()=>{clearTimeout(reconnectTimer);matched=true;$("messages").replaceChildren();$("chat-status").textContent="You're connected. Say hello.";show("chat");$("message-input").focus()});
socket.on("chat-message",message=>addMessage(message.text,false,message.timestamp));
socket.on("partner-left",()=>{matched=false;$("chat-status").textContent="The stranger has left the conversation.";show("ended")});
socket.on("chat-reset",()=>{matched=false;$("messages").replaceChildren();if(autoRematch){autoRematch=false;startMatch()}else show("welcome")});
socket.on("report-received",()=>{$("chat-status").textContent="Report received. Thanks for helping keep Weilchat safer."});
socket.on("chat-error",message=>{if(!$("chat").classList.contains("hidden"))$("chat-status").textContent=message;else $("search-status").textContent=message});

