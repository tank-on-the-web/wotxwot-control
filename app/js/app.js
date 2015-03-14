(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
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

},{}],2:[function(require,module,exports){
(function(){

  var createLogLine = function(text){
    var p = document.createElement("p");
    p.textContent = text;
    return p;
  };

  var Logger = function(){
    this.initialize.apply(this, arguments);
  };

  Logger.prototype = {
    initialize: function(elm){
      this._elm = elm;
    },
    log: function(text){
      var newlog = createLogLine(text);
      if(this._latest){
        this.elm.insertBefore(newlog, this._latest);
      }else{
        this.elm.appendChild(newlog);
      }
      this._latest = newlog;
    },
    get elm(){
      return this._elm;
    }
  };

  module.exports = Logger;

})();

},{}],3:[function(require,module,exports){
(function(){
  const SERVER = "ws://192.168.100.104/ws/";
  const INTERVAL = 500;

  var Logger = require("./logger");
  var Pad = require("./pad");
  var Driver = require("./driver");
  var TankView = require("./tank-view");

  var app = {};

  var log = function(text){
    if(app.logger){
      app.logger.log(text);
    }else{
      console.log(text);
    }
  };

  var createTankView = function(pad){
    var left = document.querySelector("#left");
    var right = document.querySelector("#right");
    return new TankView(pad, left, right);
  };

  var padConnected = function(event){
    var pad = event.gamepad;
    if(!app.pad){
      log(pad.id + "connected");
      app.pad = new Pad(pad);
      app.tankView = createTankView(app.pad);

      app.pad.calibrate().then(() =>{
        app.driver = new Driver(SERVER,
                                app.pad,
                                INTERVAL,
                                log);
        app.driver.start();
        app.tankView.start();
      });
    }
  };

  var padDisconnected = function(event){
    app.pad = null;
  };

  window.addEventListener("load", function(){
    app.logger = new Logger(document.querySelector("#log"));

    log("app started");
    window.addEventListener("gamepadconnected", 
                            padConnected);
    window.addEventListener("gamepaddisconnected", 
                            padDisconnected);
  });

  window.addEventListener("unload", function(){
    if(app.driver){
      app.driver.stop();
    }
  });
  
})();

},{"./driver":1,"./logger":2,"./pad":4,"./tank-view":5}],4:[function(require,module,exports){
(function(){

  const ATTEMPTS = 100;

  var normalizeAxis = function(value){
    return Math.min(Math.max(Math.floor(value * 100), -100), 100);
  };

  var Pad = function(){
    this.initialize.apply(this, arguments);
  };

  Pad.prototype = {
    initialize: function(pad){
      this._pad = pad;
      this._axesBaseLine = pad.axes.map(() =>{
        return 0;
      });
    },
    calibrate: function(){
      return new Promise((resolve, reject) => {
        var buf = [];
        for(var i = 0; i < ATTEMPTS; i++){
          for(var j = 0; j < this.pad.axes.length; j++){
            buf[j] = (buf[j] || 0) + this.pad.axes[j];
          }
        }
        this._axesBaseLine =  buf.map(value => {
          return value / ATTEMPTS;
        });
        resolve(this);
      });
    },
    get id(){
      return this.pad.id;
    },
    get axes(){
      var ret = [];
      for(var i = 0; i < this.pad.axes.length; i++){
        ret[i] = normalizeAxis(this.pad.axes[i] - (this._axesBaseLine[i] || 0));
      }
      return ret;
    },
    get pad(){
      return this._pad;
    },
    get rightStick(){
      return {
        x: this.axes[2],
        y: this.axes[3]
      };      
    },
    get leftStick(){
      return {
        x: this.axes[0],
        y: this.axes[1]
      };
    }
  };

  module.exports = Pad;

})();

},{}],5:[function(require,module,exports){
(function(){
  var TankView = function(){
    this.initialize.apply(this, arguments);
  };

  TankView.prototype ={
    initialize: function(pad, left, right){
      this._pad = pad;
      this._left = left;
      this._right = right;
    },
    start: function(){
      this.stopping = false;
      this.update();
    },
    stop: function(){
      this.stopping = true;
    },
    update: function(){
      this.left.textContent = this.pad.leftStick.y;
      this.right.textContent = this.pad.rightStick.y;
      if(!this.stopping){
        window.requestAnimationFrame(() => {
          this.update();
        });
      }
    },
    get pad(){
      return this._pad;
    },
    get left(){
      return this._left;
    },
    get right(){
      return this._right;
    }    
  };

  module.exports = TankView;
})();

},{}]},{},[3]);
