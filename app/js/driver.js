(function(){
  WebSocket = WebSocket || MozWebSocket;

  var Driver = function(){
    this.initialize.apply(this, arguments);
  };

  var createMessage = function(pad){
    var message = new Int8Array(new ArrayBuffer(2));
    message[0] = pad.leftStick.y;
    message[1] = pad.rightStick.y;
    return message;
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
        this.sokcet.send(createMessage(this.pad));
        window.setTimeout(() =>{
          this.update();
        }, this.interval);
      }
    },
    get working(){
      return this.pad != null && this.socket != null;
    },
    get log(){
      return this._log || console.log;
    },
    get socket(){
      return this._socker;
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
