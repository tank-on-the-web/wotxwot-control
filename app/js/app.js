(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
(function(){
  const SERVER_KEY = "server_ip";
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
        app.driver = new Driver(app.url,
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

  var onServerChanged = function(event){
    var server = app.serverInput.value;
    app.url = server;
    window.localStorage.setItem(SERVER_KEY, server);
    app.driver.restart(app.url);
  };

  window.addEventListener("load", function(){
    var server = (window.localStorage.getItem(SERVER_KEY) || "ws://192.168.1.1/ws");
    app.url = server;
    app.serverInput = document.querySelector("#server");
    app.serverInput.value = server;
    app.serverInput.onchange = onServerChanged;

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

},{"./driver":2,"./logger":3,"./pad":4,"./tank-view":5}],2:[function(require,module,exports){
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
            this.socket.send(msg.buffer);
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

},{}],3:[function(require,module,exports){
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

},{}],4:[function(require,module,exports){
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

},{}]},{},[1])
//# sourceMappingURL=data:application/json;charset:utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJhcHAvanMvbWFpbi5qcyIsImFwcC9qcy9kcml2ZXIuanMiLCJhcHAvanMvbG9nZ2VyLmpzIiwiYXBwL2pzL3BhZC5qcyIsImFwcC9qcy90YW5rLXZpZXcuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM5RUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzNHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDL0RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dmFyIGY9bmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKTt0aHJvdyBmLmNvZGU9XCJNT0RVTEVfTk9UX0ZPVU5EXCIsZn12YXIgbD1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwobC5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxsLGwuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pIiwiKGZ1bmN0aW9uKCl7XG4gIGNvbnN0IFNFUlZFUl9LRVkgPSBcInNlcnZlcl9pcFwiO1xuICBjb25zdCBJTlRFUlZBTCA9IDUwMDtcblxuICB2YXIgTG9nZ2VyID0gcmVxdWlyZShcIi4vbG9nZ2VyXCIpO1xuICB2YXIgUGFkID0gcmVxdWlyZShcIi4vcGFkXCIpO1xuICB2YXIgRHJpdmVyID0gcmVxdWlyZShcIi4vZHJpdmVyXCIpO1xuICB2YXIgVGFua1ZpZXcgPSByZXF1aXJlKFwiLi90YW5rLXZpZXdcIik7XG5cbiAgdmFyIGFwcCA9IHt9O1xuXG4gIHZhciBsb2cgPSBmdW5jdGlvbih0ZXh0KXtcbiAgICBpZihhcHAubG9nZ2VyKXtcbiAgICAgIGFwcC5sb2dnZXIubG9nKHRleHQpO1xuICAgIH1lbHNle1xuICAgICAgY29uc29sZS5sb2codGV4dCk7XG4gICAgfVxuICB9O1xuXG4gIHZhciBjcmVhdGVUYW5rVmlldyA9IGZ1bmN0aW9uKHBhZCl7XG4gICAgdmFyIGxlZnQgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKFwiI2xlZnRcIik7XG4gICAgdmFyIHJpZ2h0ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihcIiNyaWdodFwiKTtcbiAgICByZXR1cm4gbmV3IFRhbmtWaWV3KHBhZCwgbGVmdCwgcmlnaHQpO1xuICB9O1xuXG4gIHZhciBwYWRDb25uZWN0ZWQgPSBmdW5jdGlvbihldmVudCl7XG4gICAgdmFyIHBhZCA9IGV2ZW50LmdhbWVwYWQ7XG4gICAgaWYoIWFwcC5wYWQpe1xuICAgICAgbG9nKHBhZC5pZCArIFwiY29ubmVjdGVkXCIpO1xuICAgICAgYXBwLnBhZCA9IG5ldyBQYWQocGFkKTtcbiAgICAgIGFwcC50YW5rVmlldyA9IGNyZWF0ZVRhbmtWaWV3KGFwcC5wYWQpO1xuXG4gICAgICBhcHAucGFkLmNhbGlicmF0ZSgpLnRoZW4oKCkgPT57XG4gICAgICAgIGFwcC5kcml2ZXIgPSBuZXcgRHJpdmVyKGFwcC51cmwsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGFwcC5wYWQsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIElOVEVSVkFMLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBsb2cpO1xuICAgICAgICBhcHAuZHJpdmVyLnN0YXJ0KCk7XG4gICAgICAgIGFwcC50YW5rVmlldy5zdGFydCgpO1xuICAgICAgfSk7XG4gICAgfVxuICB9O1xuXG4gIHZhciBwYWREaXNjb25uZWN0ZWQgPSBmdW5jdGlvbihldmVudCl7XG4gICAgYXBwLnBhZCA9IG51bGw7XG4gIH07XG5cbiAgdmFyIG9uU2VydmVyQ2hhbmdlZCA9IGZ1bmN0aW9uKGV2ZW50KXtcbiAgICB2YXIgc2VydmVyID0gYXBwLnNlcnZlcklucHV0LnZhbHVlO1xuICAgIGFwcC51cmwgPSBzZXJ2ZXI7XG4gICAgd2luZG93LmxvY2FsU3RvcmFnZS5zZXRJdGVtKFNFUlZFUl9LRVksIHNlcnZlcik7XG4gICAgYXBwLmRyaXZlci5yZXN0YXJ0KGFwcC51cmwpO1xuICB9O1xuXG4gIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKFwibG9hZFwiLCBmdW5jdGlvbigpe1xuICAgIHZhciBzZXJ2ZXIgPSAod2luZG93LmxvY2FsU3RvcmFnZS5nZXRJdGVtKFNFUlZFUl9LRVkpIHx8IFwid3M6Ly8xOTIuMTY4LjEuMS93c1wiKTtcbiAgICBhcHAudXJsID0gc2VydmVyO1xuICAgIGFwcC5zZXJ2ZXJJbnB1dCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoXCIjc2VydmVyXCIpO1xuICAgIGFwcC5zZXJ2ZXJJbnB1dC52YWx1ZSA9IHNlcnZlcjtcbiAgICBhcHAuc2VydmVySW5wdXQub25jaGFuZ2UgPSBvblNlcnZlckNoYW5nZWQ7XG5cbiAgICBhcHAubG9nZ2VyID0gbmV3IExvZ2dlcihkb2N1bWVudC5xdWVyeVNlbGVjdG9yKFwiI2xvZ1wiKSk7XG5cblxuICAgIGxvZyhcImFwcCBzdGFydGVkXCIpO1xuICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKFwiZ2FtZXBhZGNvbm5lY3RlZFwiLCBcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBwYWRDb25uZWN0ZWQpO1xuICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKFwiZ2FtZXBhZGRpc2Nvbm5lY3RlZFwiLCBcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBwYWREaXNjb25uZWN0ZWQpO1xuICB9KTtcblxuICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcihcInVubG9hZFwiLCBmdW5jdGlvbigpe1xuICAgIGlmKGFwcC5kcml2ZXIpe1xuICAgICAgYXBwLmRyaXZlci5zdG9wKCk7XG4gICAgfVxuICB9KTtcbiAgXG59KSgpO1xuIiwiKGZ1bmN0aW9uKCl7XG4gIFdlYlNvY2tldCA9IFdlYlNvY2tldCB8fCBNb3pXZWJTb2NrZXQ7XG5cbiAgdmFyIERyaXZlciA9IGZ1bmN0aW9uKCl7XG4gICAgdGhpcy5pbml0aWFsaXplLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG4gIH07XG5cbiAgdmFyIGNyZWF0ZU1lc3NhZ2UgPSBmdW5jdGlvbihwYWQpe1xuICAgIHZhciBtZXNzYWdlID0gbmV3IEludDhBcnJheShuZXcgQXJyYXlCdWZmZXIoMikpO1xuICAgIG1lc3NhZ2VbMF0gPSBwYWQubGVmdFN0aWNrLnk7XG4gICAgbWVzc2FnZVsxXSA9IHBhZC5yaWdodFN0aWNrLnk7XG4gICAgcmV0dXJuIG1lc3NhZ2U7XG4gIH07XG5cbiAgRHJpdmVyLnByb3RvdHlwZSA9IHtcbiAgICBpbml0aWFsaXplOiBmdW5jdGlvbihzZXJ2ZXIsIHBhZCwgaW50ZXJ2YWwsIGxvZyl7XG4gICAgICB0aGlzLl9zZXJ2ZXIgPSBzZXJ2ZXI7XG4gICAgICB0aGlzLl9wYWQgPSBwYWQ7XG4gICAgICB0aGlzLl9pbnRlcnZhbCA9IGludGVydmFsO1xuICAgICAgdGhpcy5fbG9nID0gbG9nO1xuICAgIH0sXG4gICAgc3RhcnQ6IGZ1bmN0aW9uKCl7XG4gICAgICBpZih0aGlzLnJlYWR5KXtcbiAgICAgICAgdGhpcy5sb2coXCJzdGFydCBkcml2ZXJcIik7XG4gICAgICAgIGlmICh0aGlzLnNlcnZlci5pbmRleE9mKFwid3M6Ly9cIikgPT09IDApIHtcbiAgICAgICAgICB0aGlzLmxvZyhcImNyZWF0aW5nIGEgc29ja2V0IHRvIFwiICsgdGhpcy5zZXJ2ZXIpO1xuICAgICAgICAgIHZhciBzb2NrZXQgPSBuZXcgV2ViU29ja2V0KHRoaXMuc2VydmVyKTtcbiAgICAgICAgICBzb2NrZXQub25vcGVuID0gKGV2ZW50KSA9PiB7XG4gICAgICAgICAgICB0aGlzLmxvZyhcIlNvY2tldCBpcyBvcGVuZWRcIik7XG4gICAgICAgICAgICB0aGlzLl9zb2NrZXQgPSBzb2NrZXQ7XG4gICAgICAgICAgICB0aGlzLnVwZGF0ZSgpO1xuICAgICAgICAgIH07XG4gICAgICAgICAgc29ja2V0Lm9uY2xvc2UgPSAoZXZlbnQpID0+IHtcbiAgICAgICAgICAgIHRoaXMuIGxvZyhcIlNvY2tldCBpcyBjbG9zZWRcIik7XG4gICAgICAgICAgICB0aGlzLl9zb2NrZXQgPSBudWxsO1xuICAgICAgICAgIH07XG4gICAgICAgICAgc29ja2V0LmVycm9yID0gKGV2ZW50KSA9PntcbiAgICAgICAgICAgIHRoaXMubG9nKGV2ZW50LmRhdGEpO1xuICAgICAgICAgIH07XG4gICAgICAgICAgc29ja2V0Lm9ubWVzc2FnZSA9IChldmVudCkgPT4ge1xuICAgICAgICAgICAgdGhpcy5sb2coZXZlbnQuZGF0YSk7XG4gICAgICAgICAgfTtcbiAgICAgICAgICB0aGlzLnNlbmRNZXNzYWdlID0gKCkgPT4ge1xuICAgICAgICAgICAgdmFyIG1zZyA9IGNyZWF0ZU1lc3NhZ2UodGhpcy5wYWQpO1xuICAgICAgICAgICAgdGhpcy5zb2NrZXQuc2VuZChtc2cuYnVmZmVyKTtcbiAgICAgICAgICB9O1xuICAgICAgICB9IGVsc2UgaWYgKHRoaXMuc2VydmVyLmluZGV4T2YoXCJodHRwOi8vXCIpID09PSAwKSB7XG4gICAgICAgICAgdGhpcy5sb2coXCJzZXJ2ZXIgdXJsIGlzIFwiICsgdGhpcy5zZXJ2ZXIpO1xuICAgICAgICAgIHRoaXMuX2h0dHAgPSB0cnVlO1xuICAgICAgICAgIHRoaXMuc2VuZE1lc3NhZ2UgPSAoKSA9PiB7XG4gICAgICAgICAgICB2YXIgdXJsID0gdGhpcy5zZXJ2ZXIgKyBcIi9wdXQ/bHY9XCIgKyB0aGlzLnBhZC5sZWZ0U3RpY2sueSArIFwiJnJ2PVwiICsgdGhpcy5wYWQucmlnaHRTdGljay55O1xuICAgICAgICAgICAgLy8gdGhpcy5sb2codXJsKTtcbiAgICAgICAgICAgIHZhciB4aHIgPSBuZXcgWE1MSHR0cFJlcXVlc3QoKTtcbiAgICAgICAgICAgIHhoci5vcGVuKFwiR0VUXCIsIHVybCk7XG4gICAgICAgICAgICB4aHIuc2VuZCgpO1xuICAgICAgICAgICAgeGhyLmFkZEV2ZW50TGlzdGVuZXIoXCJlcnJvclwiLCAoZXZ0KSA9PiB7XG4gICAgICAgICAgICAgIHRoaXMubG9nKFwiRmFpbGVkIHRvIHNlbmQ6IFwiICsgdXJsKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH07XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy51cGRhdGUoKTtcbiAgICAgIH1cbiAgICB9LFxuICAgIHN0b3A6IGZ1bmN0aW9uKCl7XG4gICAgICBpZih0aGlzLnNvY2tldCl7XG4gICAgICAgIHRoaXMubG9nKFwic3RvcCBkcml2ZXJcIik7XG4gICAgICAgIHRoaXMuc29ja2V0LmNsb3NlKCk7XG4gICAgICB9XG4gICAgfSxcbiAgICB1cGRhdGU6IGZ1bmN0aW9uKCl7XG4gICAgICBpZih0aGlzLndvcmtpbmcpe1xuICAgICAgICB0aGlzLnNlbmRNZXNzYWdlKCk7XG4gICAgICAgIHdpbmRvdy5zZXRUaW1lb3V0KCgpID0+e1xuICAgICAgICAgIHRoaXMudXBkYXRlKCk7XG4gICAgICAgIH0sIHRoaXMuaW50ZXJ2YWwpO1xuICAgICAgfVxuICAgIH0sXG4gICAgcmVzdGFydDogZnVuY3Rpb24oc2VydmVyKXtcbiAgICAgIHRoaXMuX3NlcnZlciA9IHNlcnZlcjtcbiAgICAgIHRoaXMuc3RvcCgpO1xuICAgICAgdGhpcy5zdGFydCgpO1xuICAgIH0sXG4gICAgZ2V0IHdvcmtpbmcoKXtcbiAgICAgIHJldHVybiB0aGlzLnBhZCAhPSBudWxsICYmICh0aGlzLl9odHRwIHx8IHRoaXMuc29ja2V0ICE9IG51bGwpO1xuICAgIH0sXG4gICAgZ2V0IGxvZygpe1xuICAgICAgcmV0dXJuIHRoaXMuX2xvZyB8fCBjb25zb2xlLmxvZztcbiAgICB9LFxuICAgIGdldCBzb2NrZXQoKXtcbiAgICAgIHJldHVybiB0aGlzLl9zb2NrZXQ7XG4gICAgfSxcbiAgICBnZXQgcmVhZHkoKXtcbiAgICAgIHJldHVybiB0aGlzLnNlcnZlciAhPSBudWxsICYmIHRoaXMucGFkICE9IG51bGwgJiYgdGhpcy5zb2NrZXQgPT0gbnVsbDtcbiAgICB9LFxuICAgIGdldCBpbnRlcnZhbCgpe1xuICAgICAgcmV0dXJuIHRoaXMuX2ludGVydmFsO1xuICAgIH0sXG4gICAgZ2V0IHBhZCgpe1xuICAgICAgcmV0dXJuIHRoaXMuX3BhZDtcbiAgICB9LFxuICAgIGdldCBzZXJ2ZXIoKXtcbiAgICAgIHJldHVybiB0aGlzLl9zZXJ2ZXI7XG4gICAgfVxuICB9O1xuICBcbiAgbW9kdWxlLmV4cG9ydHMgPSBEcml2ZXI7XG59KSgpO1xuIiwiKGZ1bmN0aW9uKCl7XG5cbiAgdmFyIGNyZWF0ZUxvZ0xpbmUgPSBmdW5jdGlvbih0ZXh0KXtcbiAgICB2YXIgcCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJwXCIpO1xuICAgIHAudGV4dENvbnRlbnQgPSB0ZXh0O1xuICAgIHJldHVybiBwO1xuICB9O1xuXG4gIHZhciBMb2dnZXIgPSBmdW5jdGlvbigpe1xuICAgIHRoaXMuaW5pdGlhbGl6ZS5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuICB9O1xuXG4gIExvZ2dlci5wcm90b3R5cGUgPSB7XG4gICAgaW5pdGlhbGl6ZTogZnVuY3Rpb24oZWxtKXtcbiAgICAgIHRoaXMuX2VsbSA9IGVsbTtcbiAgICB9LFxuICAgIGxvZzogZnVuY3Rpb24odGV4dCl7XG4gICAgICB2YXIgbmV3bG9nID0gY3JlYXRlTG9nTGluZSh0ZXh0KTtcbiAgICAgIGlmKHRoaXMuX2xhdGVzdCl7XG4gICAgICAgIHRoaXMuZWxtLmluc2VydEJlZm9yZShuZXdsb2csIHRoaXMuX2xhdGVzdCk7XG4gICAgICB9ZWxzZXtcbiAgICAgICAgdGhpcy5lbG0uYXBwZW5kQ2hpbGQobmV3bG9nKTtcbiAgICAgIH1cbiAgICAgIHRoaXMuX2xhdGVzdCA9IG5ld2xvZztcbiAgICB9LFxuICAgIGdldCBlbG0oKXtcbiAgICAgIHJldHVybiB0aGlzLl9lbG07XG4gICAgfVxuICB9O1xuXG4gIG1vZHVsZS5leHBvcnRzID0gTG9nZ2VyO1xuXG59KSgpO1xuIiwiKGZ1bmN0aW9uKCl7XG5cbiAgY29uc3QgQVRURU1QVFMgPSAxMDA7XG5cbiAgdmFyIG5vcm1hbGl6ZUF4aXMgPSBmdW5jdGlvbih2YWx1ZSl7XG4gICAgcmV0dXJuIE1hdGgubWluKE1hdGgubWF4KE1hdGguZmxvb3IodmFsdWUgKiAxMDApLCAtMTAwKSwgMTAwKTtcbiAgfTtcblxuICB2YXIgUGFkID0gZnVuY3Rpb24oKXtcbiAgICB0aGlzLmluaXRpYWxpemUuYXBwbHkodGhpcywgYXJndW1lbnRzKTtcbiAgfTtcblxuICBQYWQucHJvdG90eXBlID0ge1xuICAgIGluaXRpYWxpemU6IGZ1bmN0aW9uKHBhZCl7XG4gICAgICB0aGlzLl9wYWQgPSBwYWQ7XG4gICAgICB0aGlzLl9heGVzQmFzZUxpbmUgPSBwYWQuYXhlcy5tYXAoKCkgPT57XG4gICAgICAgIHJldHVybiAwO1xuICAgICAgfSk7XG4gICAgfSxcbiAgICBjYWxpYnJhdGU6IGZ1bmN0aW9uKCl7XG4gICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgICB2YXIgYnVmID0gW107XG4gICAgICAgIGZvcih2YXIgaSA9IDA7IGkgPCBBVFRFTVBUUzsgaSsrKXtcbiAgICAgICAgICBmb3IodmFyIGogPSAwOyBqIDwgdGhpcy5wYWQuYXhlcy5sZW5ndGg7IGorKyl7XG4gICAgICAgICAgICBidWZbal0gPSAoYnVmW2pdIHx8IDApICsgdGhpcy5wYWQuYXhlc1tqXTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5fYXhlc0Jhc2VMaW5lID0gIGJ1Zi5tYXAodmFsdWUgPT4ge1xuICAgICAgICAgIHJldHVybiB2YWx1ZSAvIEFUVEVNUFRTO1xuICAgICAgICB9KTtcbiAgICAgICAgcmVzb2x2ZSh0aGlzKTtcbiAgICAgIH0pO1xuICAgIH0sXG4gICAgZ2V0IGlkKCl7XG4gICAgICByZXR1cm4gdGhpcy5wYWQuaWQ7XG4gICAgfSxcbiAgICBnZXQgYXhlcygpe1xuICAgICAgdmFyIHJldCA9IFtdO1xuICAgICAgZm9yKHZhciBpID0gMDsgaSA8IHRoaXMucGFkLmF4ZXMubGVuZ3RoOyBpKyspe1xuICAgICAgICByZXRbaV0gPSBub3JtYWxpemVBeGlzKHRoaXMucGFkLmF4ZXNbaV0gLSAodGhpcy5fYXhlc0Jhc2VMaW5lW2ldIHx8IDApKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiByZXQ7XG4gICAgfSxcbiAgICBnZXQgcGFkKCl7XG4gICAgICByZXR1cm4gdGhpcy5fcGFkO1xuICAgIH0sXG4gICAgZ2V0IHJpZ2h0U3RpY2soKXtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHg6IHRoaXMuYXhlc1syXSxcbiAgICAgICAgeTogdGhpcy5heGVzWzNdXG4gICAgICB9OyAgICAgIFxuICAgIH0sXG4gICAgZ2V0IGxlZnRTdGljaygpe1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgeDogdGhpcy5heGVzWzBdLFxuICAgICAgICB5OiB0aGlzLmF4ZXNbMV1cbiAgICAgIH07XG4gICAgfVxuICB9O1xuXG4gIG1vZHVsZS5leHBvcnRzID0gUGFkO1xuXG59KSgpO1xuIiwiKGZ1bmN0aW9uKCl7XG4gIHZhciBUYW5rVmlldyA9IGZ1bmN0aW9uKCl7XG4gICAgdGhpcy5pbml0aWFsaXplLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG4gIH07XG5cbiAgVGFua1ZpZXcucHJvdG90eXBlID17XG4gICAgaW5pdGlhbGl6ZTogZnVuY3Rpb24ocGFkLCBsZWZ0LCByaWdodCl7XG4gICAgICB0aGlzLl9wYWQgPSBwYWQ7XG4gICAgICB0aGlzLl9sZWZ0ID0gbGVmdDtcbiAgICAgIHRoaXMuX3JpZ2h0ID0gcmlnaHQ7XG4gICAgfSxcbiAgICBzdGFydDogZnVuY3Rpb24oKXtcbiAgICAgIHRoaXMuc3RvcHBpbmcgPSBmYWxzZTtcbiAgICAgIHRoaXMudXBkYXRlKCk7XG4gICAgfSxcbiAgICBzdG9wOiBmdW5jdGlvbigpe1xuICAgICAgdGhpcy5zdG9wcGluZyA9IHRydWU7XG4gICAgfSxcbiAgICB1cGRhdGU6IGZ1bmN0aW9uKCl7XG4gICAgICB0aGlzLmxlZnQudGV4dENvbnRlbnQgPSB0aGlzLnBhZC5sZWZ0U3RpY2sueTtcbiAgICAgIHRoaXMucmlnaHQudGV4dENvbnRlbnQgPSB0aGlzLnBhZC5yaWdodFN0aWNrLnk7XG4gICAgICBpZighdGhpcy5zdG9wcGluZyl7XG4gICAgICAgIHdpbmRvdy5yZXF1ZXN0QW5pbWF0aW9uRnJhbWUoKCkgPT4ge1xuICAgICAgICAgIHRoaXMudXBkYXRlKCk7XG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH0sXG4gICAgZ2V0IHBhZCgpe1xuICAgICAgcmV0dXJuIHRoaXMuX3BhZDtcbiAgICB9LFxuICAgIGdldCBsZWZ0KCl7XG4gICAgICByZXR1cm4gdGhpcy5fbGVmdDtcbiAgICB9LFxuICAgIGdldCByaWdodCgpe1xuICAgICAgcmV0dXJuIHRoaXMuX3JpZ2h0O1xuICAgIH0gICAgXG4gIH07XG5cbiAgbW9kdWxlLmV4cG9ydHMgPSBUYW5rVmlldztcbn0pKCk7XG4iXX0=
