(function(){
  WebSocket = WebSocket || MozWebSocket;

  var Driver = function(){
    this.initialize.apply(this, arguments);
  };

  var createMessage = function(pad){
    var data = {
      lv: pad.leftStick.y,
      rv: pad.rightStick.y
    };
    var message = {
      motor: data,
      fire: pad.buttons[10].pressed || pad.buttons[11].pressed
    };
    return JSON.stringify(message);
  };

  Driver.prototype = {
    initialize: function(server, pad, interval, log){
      this._server = server;
      this._pad = pad;
      this._interval = interval;
      this._log = log;
    },
    start: function(){
      if(this.ready){
        this.log("start driver");
        if (this.server.indexOf("ws://") === 0) {
          this.log("creating a socket to " + this.server);
          var socket = new WebSocket(this.server);
          socket.onopen = (event) => {
            this.log("Socket is opened");
            this._socket = socket;
            this.update();
          };
          socket.onclose = (event) => {
            this. log("Socket is closed");
            this._socket = null;
          };
          socket.error = (event) =>{
            this.log(event.data);
          };
          socket.onmessage = (event) => {
            this.log(event.data);
          };
          this.sendMessage = () => {
            var msg = createMessage(this.pad);
            this.socket.send(msg);
          };
        } else if (this.server.indexOf("http://") === 0) {
          this.log("server url is " + this.server);
          this._http = true;
          this.sendMessage = () => {
            var url = this.server + "/put?lv=" + this.pad.leftStick.y + "&rv=" + this.pad.rightStick.y;
            // this.log(url);
            var xhr = new XMLHttpRequest();
            xhr.open("GET", url);
            xhr.send();
            xhr.addEventListener("error", (evt) => {
              this.log("Failed to send: " + url);
            });
          };
        }
        this.update();
      }
    },
    stop: function(){
      if(this.socket){
        this.log("stop driver");
        this.socket.close();
      }
    },
    update: function(){
      if(this.working){
        this.sendMessage();
        window.setTimeout(() =>{
          this.update();
        }, this.interval);
      }
    },
    restart: function(server){
      this._server = server;
      this.stop();
      this.start();
    },
    get working(){
      return this.pad != null && (this._http || this.socket != null);
    },
    get log(){
      return this._log || console.log;
    },
    get socket(){
      return this._socket;
    },
    get ready(){
      return this.server != null && this.pad != null && this.socket == null;
    },
    get interval(){
      return this._interval;
    },
    get pad(){
      return this._pad;
    },
    get server(){
      return this._server;
    }
  };
  
  module.exports = Driver;
})();
