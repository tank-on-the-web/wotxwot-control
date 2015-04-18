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
    app.url = "ws://" + server + "/ws/";
    window.localStorage.setItem(SERVER_KEY, server);
    app.driver.restart(app.url);
  };

  window.addEventListener("load", function(){
    var server = (window.localStorage.getItem(SERVER_KEY) || "192.168.1.10");
    app.url = "ws://" + server + "/ws/";
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
        var msg = createMessage(this.pad);
        this.socket.send(msg.buffer);
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
      return this.pad != null && this.socket != null;
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJhcHAvanMvbWFpbi5qcyIsImFwcC9qcy9kcml2ZXIuanMiLCJhcHAvanMvbG9nZ2VyLmpzIiwiYXBwL2pzL3BhZC5qcyIsImFwcC9qcy90YW5rLXZpZXcuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM5RUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3pGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDL0RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dmFyIGY9bmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKTt0aHJvdyBmLmNvZGU9XCJNT0RVTEVfTk9UX0ZPVU5EXCIsZn12YXIgbD1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwobC5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxsLGwuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pIiwiKGZ1bmN0aW9uKCl7XG4gIGNvbnN0IFNFUlZFUl9LRVkgPSBcInNlcnZlcl9pcFwiO1xuICBjb25zdCBJTlRFUlZBTCA9IDUwMDtcblxuICB2YXIgTG9nZ2VyID0gcmVxdWlyZShcIi4vbG9nZ2VyXCIpO1xuICB2YXIgUGFkID0gcmVxdWlyZShcIi4vcGFkXCIpO1xuICB2YXIgRHJpdmVyID0gcmVxdWlyZShcIi4vZHJpdmVyXCIpO1xuICB2YXIgVGFua1ZpZXcgPSByZXF1aXJlKFwiLi90YW5rLXZpZXdcIik7XG5cbiAgdmFyIGFwcCA9IHt9O1xuXG4gIHZhciBsb2cgPSBmdW5jdGlvbih0ZXh0KXtcbiAgICBpZihhcHAubG9nZ2VyKXtcbiAgICAgIGFwcC5sb2dnZXIubG9nKHRleHQpO1xuICAgIH1lbHNle1xuICAgICAgY29uc29sZS5sb2codGV4dCk7XG4gICAgfVxuICB9O1xuXG4gIHZhciBjcmVhdGVUYW5rVmlldyA9IGZ1bmN0aW9uKHBhZCl7XG4gICAgdmFyIGxlZnQgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKFwiI2xlZnRcIik7XG4gICAgdmFyIHJpZ2h0ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihcIiNyaWdodFwiKTtcbiAgICByZXR1cm4gbmV3IFRhbmtWaWV3KHBhZCwgbGVmdCwgcmlnaHQpO1xuICB9O1xuXG4gIHZhciBwYWRDb25uZWN0ZWQgPSBmdW5jdGlvbihldmVudCl7XG4gICAgdmFyIHBhZCA9IGV2ZW50LmdhbWVwYWQ7XG4gICAgaWYoIWFwcC5wYWQpe1xuICAgICAgbG9nKHBhZC5pZCArIFwiY29ubmVjdGVkXCIpO1xuICAgICAgYXBwLnBhZCA9IG5ldyBQYWQocGFkKTtcbiAgICAgIGFwcC50YW5rVmlldyA9IGNyZWF0ZVRhbmtWaWV3KGFwcC5wYWQpO1xuXG4gICAgICBhcHAucGFkLmNhbGlicmF0ZSgpLnRoZW4oKCkgPT57XG4gICAgICAgIGFwcC5kcml2ZXIgPSBuZXcgRHJpdmVyKGFwcC51cmwsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGFwcC5wYWQsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIElOVEVSVkFMLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBsb2cpO1xuICAgICAgICBhcHAuZHJpdmVyLnN0YXJ0KCk7XG4gICAgICAgIGFwcC50YW5rVmlldy5zdGFydCgpO1xuICAgICAgfSk7XG4gICAgfVxuICB9O1xuXG4gIHZhciBwYWREaXNjb25uZWN0ZWQgPSBmdW5jdGlvbihldmVudCl7XG4gICAgYXBwLnBhZCA9IG51bGw7XG4gIH07XG5cbiAgdmFyIG9uU2VydmVyQ2hhbmdlZCA9IGZ1bmN0aW9uKGV2ZW50KXtcbiAgICB2YXIgc2VydmVyID0gYXBwLnNlcnZlcklucHV0LnZhbHVlO1xuICAgIGFwcC51cmwgPSBcIndzOi8vXCIgKyBzZXJ2ZXIgKyBcIi93cy9cIjtcbiAgICB3aW5kb3cubG9jYWxTdG9yYWdlLnNldEl0ZW0oU0VSVkVSX0tFWSwgc2VydmVyKTtcbiAgICBhcHAuZHJpdmVyLnJlc3RhcnQoYXBwLnVybCk7XG4gIH07XG5cbiAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoXCJsb2FkXCIsIGZ1bmN0aW9uKCl7XG4gICAgdmFyIHNlcnZlciA9ICh3aW5kb3cubG9jYWxTdG9yYWdlLmdldEl0ZW0oU0VSVkVSX0tFWSkgfHwgXCIxOTIuMTY4LjEuMTBcIik7XG4gICAgYXBwLnVybCA9IFwid3M6Ly9cIiArIHNlcnZlciArIFwiL3dzL1wiO1xuICAgIGFwcC5zZXJ2ZXJJbnB1dCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoXCIjc2VydmVyXCIpO1xuICAgIGFwcC5zZXJ2ZXJJbnB1dC52YWx1ZSA9IHNlcnZlcjtcbiAgICBhcHAuc2VydmVySW5wdXQub25jaGFuZ2UgPSBvblNlcnZlckNoYW5nZWQ7XG5cbiAgICBhcHAubG9nZ2VyID0gbmV3IExvZ2dlcihkb2N1bWVudC5xdWVyeVNlbGVjdG9yKFwiI2xvZ1wiKSk7XG5cblxuICAgIGxvZyhcImFwcCBzdGFydGVkXCIpO1xuICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKFwiZ2FtZXBhZGNvbm5lY3RlZFwiLCBcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBwYWRDb25uZWN0ZWQpO1xuICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKFwiZ2FtZXBhZGRpc2Nvbm5lY3RlZFwiLCBcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBwYWREaXNjb25uZWN0ZWQpO1xuICB9KTtcblxuICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcihcInVubG9hZFwiLCBmdW5jdGlvbigpe1xuICAgIGlmKGFwcC5kcml2ZXIpe1xuICAgICAgYXBwLmRyaXZlci5zdG9wKCk7XG4gICAgfVxuICB9KTtcbiAgXG59KSgpO1xuIiwiKGZ1bmN0aW9uKCl7XG4gIFdlYlNvY2tldCA9IFdlYlNvY2tldCB8fCBNb3pXZWJTb2NrZXQ7XG5cbiAgdmFyIERyaXZlciA9IGZ1bmN0aW9uKCl7XG4gICAgdGhpcy5pbml0aWFsaXplLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG4gIH07XG5cbiAgdmFyIGNyZWF0ZU1lc3NhZ2UgPSBmdW5jdGlvbihwYWQpe1xuICAgIHZhciBtZXNzYWdlID0gbmV3IEludDhBcnJheShuZXcgQXJyYXlCdWZmZXIoMikpO1xuICAgIG1lc3NhZ2VbMF0gPSBwYWQubGVmdFN0aWNrLnk7XG4gICAgbWVzc2FnZVsxXSA9IHBhZC5yaWdodFN0aWNrLnk7XG4gICAgcmV0dXJuIG1lc3NhZ2U7XG4gIH07XG5cbiAgRHJpdmVyLnByb3RvdHlwZSA9IHtcbiAgICBpbml0aWFsaXplOiBmdW5jdGlvbihzZXJ2ZXIsIHBhZCwgaW50ZXJ2YWwsIGxvZyl7XG4gICAgICB0aGlzLl9zZXJ2ZXIgPSBzZXJ2ZXI7XG4gICAgICB0aGlzLl9wYWQgPSBwYWQ7XG4gICAgICB0aGlzLl9pbnRlcnZhbCA9IGludGVydmFsO1xuICAgICAgdGhpcy5fbG9nID0gbG9nO1xuICAgIH0sXG4gICAgc3RhcnQ6IGZ1bmN0aW9uKCl7XG4gICAgICBpZih0aGlzLnJlYWR5KXtcbiAgICAgICAgdGhpcy5sb2coXCJzdGFydCBkcml2ZXJcIik7XG4gICAgICAgIHRoaXMubG9nKFwiY3JlYXRpbmcgYSBzb2NrZXQgdG8gXCIgKyB0aGlzLnNlcnZlcik7XG4gICAgICAgIHZhciBzb2NrZXQgPSBuZXcgV2ViU29ja2V0KHRoaXMuc2VydmVyKTtcbiAgICAgICAgc29ja2V0Lm9ub3BlbiA9IChldmVudCkgPT4ge1xuICAgICAgICAgIHRoaXMubG9nKFwiU29ja2V0IGlzIG9wZW5lZFwiKTtcbiAgICAgICAgICB0aGlzLl9zb2NrZXQgPSBzb2NrZXQ7XG4gICAgICAgICAgdGhpcy51cGRhdGUoKTtcbiAgICAgICAgfTtcbiAgICAgICAgc29ja2V0Lm9uY2xvc2UgPSAoZXZlbnQpID0+IHtcbiAgICAgICAgICB0aGlzLiBsb2coXCJTb2NrZXQgaXMgY2xvc2VkXCIpO1xuICAgICAgICAgIHRoaXMuX3NvY2tldCA9IG51bGw7XG4gICAgICAgIH07XG4gICAgICAgIHNvY2tldC5lcnJvciA9IChldmVudCkgPT57XG4gICAgICAgICAgdGhpcy5sb2coZXZlbnQuZGF0YSk7XG4gICAgICAgIH07XG4gICAgICAgIHNvY2tldC5vbm1lc3NhZ2UgPSAoZXZlbnQpID0+IHtcbiAgICAgICAgICB0aGlzLmxvZyhldmVudC5kYXRhKTtcbiAgICAgICAgfTsgICAgICAgIFxuICAgICAgICB0aGlzLnVwZGF0ZSgpO1xuICAgICAgfVxuICAgIH0sXG4gICAgc3RvcDogZnVuY3Rpb24oKXtcbiAgICAgIGlmKHRoaXMuc29ja2V0KXtcbiAgICAgICAgdGhpcy5sb2coXCJzdG9wIGRyaXZlclwiKTtcbiAgICAgICAgdGhpcy5zb2NrZXQuY2xvc2UoKTtcbiAgICAgIH1cbiAgICB9LFxuICAgIHVwZGF0ZTogZnVuY3Rpb24oKXtcbiAgICAgIGlmKHRoaXMud29ya2luZyl7XG4gICAgICAgIHZhciBtc2cgPSBjcmVhdGVNZXNzYWdlKHRoaXMucGFkKTtcbiAgICAgICAgdGhpcy5zb2NrZXQuc2VuZChtc2cuYnVmZmVyKTtcbiAgICAgICAgd2luZG93LnNldFRpbWVvdXQoKCkgPT57XG4gICAgICAgICAgdGhpcy51cGRhdGUoKTtcbiAgICAgICAgfSwgdGhpcy5pbnRlcnZhbCk7XG4gICAgICB9XG4gICAgfSxcbiAgICByZXN0YXJ0OiBmdW5jdGlvbihzZXJ2ZXIpe1xuICAgICAgdGhpcy5fc2VydmVyID0gc2VydmVyO1xuICAgICAgdGhpcy5zdG9wKCk7XG4gICAgICB0aGlzLnN0YXJ0KCk7XG4gICAgfSxcbiAgICBnZXQgd29ya2luZygpe1xuICAgICAgcmV0dXJuIHRoaXMucGFkICE9IG51bGwgJiYgdGhpcy5zb2NrZXQgIT0gbnVsbDtcbiAgICB9LFxuICAgIGdldCBsb2coKXtcbiAgICAgIHJldHVybiB0aGlzLl9sb2cgfHwgY29uc29sZS5sb2c7XG4gICAgfSxcbiAgICBnZXQgc29ja2V0KCl7XG4gICAgICByZXR1cm4gdGhpcy5fc29ja2V0O1xuICAgIH0sXG4gICAgZ2V0IHJlYWR5KCl7XG4gICAgICByZXR1cm4gdGhpcy5zZXJ2ZXIgIT0gbnVsbCAmJiB0aGlzLnBhZCAhPSBudWxsICYmIHRoaXMuc29ja2V0ID09IG51bGw7XG4gICAgfSxcbiAgICBnZXQgaW50ZXJ2YWwoKXtcbiAgICAgIHJldHVybiB0aGlzLl9pbnRlcnZhbDtcbiAgICB9LFxuICAgIGdldCBwYWQoKXtcbiAgICAgIHJldHVybiB0aGlzLl9wYWQ7XG4gICAgfSxcbiAgICBnZXQgc2VydmVyKCl7XG4gICAgICByZXR1cm4gdGhpcy5fc2VydmVyO1xuICAgIH1cbiAgfTtcbiAgXG4gIG1vZHVsZS5leHBvcnRzID0gRHJpdmVyO1xufSkoKTtcbiIsIihmdW5jdGlvbigpe1xuXG4gIHZhciBjcmVhdGVMb2dMaW5lID0gZnVuY3Rpb24odGV4dCl7XG4gICAgdmFyIHAgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwicFwiKTtcbiAgICBwLnRleHRDb250ZW50ID0gdGV4dDtcbiAgICByZXR1cm4gcDtcbiAgfTtcblxuICB2YXIgTG9nZ2VyID0gZnVuY3Rpb24oKXtcbiAgICB0aGlzLmluaXRpYWxpemUuYXBwbHkodGhpcywgYXJndW1lbnRzKTtcbiAgfTtcblxuICBMb2dnZXIucHJvdG90eXBlID0ge1xuICAgIGluaXRpYWxpemU6IGZ1bmN0aW9uKGVsbSl7XG4gICAgICB0aGlzLl9lbG0gPSBlbG07XG4gICAgfSxcbiAgICBsb2c6IGZ1bmN0aW9uKHRleHQpe1xuICAgICAgdmFyIG5ld2xvZyA9IGNyZWF0ZUxvZ0xpbmUodGV4dCk7XG4gICAgICBpZih0aGlzLl9sYXRlc3Qpe1xuICAgICAgICB0aGlzLmVsbS5pbnNlcnRCZWZvcmUobmV3bG9nLCB0aGlzLl9sYXRlc3QpO1xuICAgICAgfWVsc2V7XG4gICAgICAgIHRoaXMuZWxtLmFwcGVuZENoaWxkKG5ld2xvZyk7XG4gICAgICB9XG4gICAgICB0aGlzLl9sYXRlc3QgPSBuZXdsb2c7XG4gICAgfSxcbiAgICBnZXQgZWxtKCl7XG4gICAgICByZXR1cm4gdGhpcy5fZWxtO1xuICAgIH1cbiAgfTtcblxuICBtb2R1bGUuZXhwb3J0cyA9IExvZ2dlcjtcblxufSkoKTtcbiIsIihmdW5jdGlvbigpe1xuXG4gIGNvbnN0IEFUVEVNUFRTID0gMTAwO1xuXG4gIHZhciBub3JtYWxpemVBeGlzID0gZnVuY3Rpb24odmFsdWUpe1xuICAgIHJldHVybiBNYXRoLm1pbihNYXRoLm1heChNYXRoLmZsb29yKHZhbHVlICogMTAwKSwgLTEwMCksIDEwMCk7XG4gIH07XG5cbiAgdmFyIFBhZCA9IGZ1bmN0aW9uKCl7XG4gICAgdGhpcy5pbml0aWFsaXplLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG4gIH07XG5cbiAgUGFkLnByb3RvdHlwZSA9IHtcbiAgICBpbml0aWFsaXplOiBmdW5jdGlvbihwYWQpe1xuICAgICAgdGhpcy5fcGFkID0gcGFkO1xuICAgICAgdGhpcy5fYXhlc0Jhc2VMaW5lID0gcGFkLmF4ZXMubWFwKCgpID0+e1xuICAgICAgICByZXR1cm4gMDtcbiAgICAgIH0pO1xuICAgIH0sXG4gICAgY2FsaWJyYXRlOiBmdW5jdGlvbigpe1xuICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAgICAgdmFyIGJ1ZiA9IFtdO1xuICAgICAgICBmb3IodmFyIGkgPSAwOyBpIDwgQVRURU1QVFM7IGkrKyl7XG4gICAgICAgICAgZm9yKHZhciBqID0gMDsgaiA8IHRoaXMucGFkLmF4ZXMubGVuZ3RoOyBqKyspe1xuICAgICAgICAgICAgYnVmW2pdID0gKGJ1ZltqXSB8fCAwKSArIHRoaXMucGFkLmF4ZXNbal07XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHRoaXMuX2F4ZXNCYXNlTGluZSA9ICBidWYubWFwKHZhbHVlID0+IHtcbiAgICAgICAgICByZXR1cm4gdmFsdWUgLyBBVFRFTVBUUztcbiAgICAgICAgfSk7XG4gICAgICAgIHJlc29sdmUodGhpcyk7XG4gICAgICB9KTtcbiAgICB9LFxuICAgIGdldCBpZCgpe1xuICAgICAgcmV0dXJuIHRoaXMucGFkLmlkO1xuICAgIH0sXG4gICAgZ2V0IGF4ZXMoKXtcbiAgICAgIHZhciByZXQgPSBbXTtcbiAgICAgIGZvcih2YXIgaSA9IDA7IGkgPCB0aGlzLnBhZC5heGVzLmxlbmd0aDsgaSsrKXtcbiAgICAgICAgcmV0W2ldID0gbm9ybWFsaXplQXhpcyh0aGlzLnBhZC5heGVzW2ldIC0gKHRoaXMuX2F4ZXNCYXNlTGluZVtpXSB8fCAwKSk7XG4gICAgICB9XG4gICAgICByZXR1cm4gcmV0O1xuICAgIH0sXG4gICAgZ2V0IHBhZCgpe1xuICAgICAgcmV0dXJuIHRoaXMuX3BhZDtcbiAgICB9LFxuICAgIGdldCByaWdodFN0aWNrKCl7XG4gICAgICByZXR1cm4ge1xuICAgICAgICB4OiB0aGlzLmF4ZXNbMl0sXG4gICAgICAgIHk6IHRoaXMuYXhlc1szXVxuICAgICAgfTsgICAgICBcbiAgICB9LFxuICAgIGdldCBsZWZ0U3RpY2soKXtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHg6IHRoaXMuYXhlc1swXSxcbiAgICAgICAgeTogdGhpcy5heGVzWzFdXG4gICAgICB9O1xuICAgIH1cbiAgfTtcblxuICBtb2R1bGUuZXhwb3J0cyA9IFBhZDtcblxufSkoKTtcbiIsIihmdW5jdGlvbigpe1xuICB2YXIgVGFua1ZpZXcgPSBmdW5jdGlvbigpe1xuICAgIHRoaXMuaW5pdGlhbGl6ZS5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuICB9O1xuXG4gIFRhbmtWaWV3LnByb3RvdHlwZSA9e1xuICAgIGluaXRpYWxpemU6IGZ1bmN0aW9uKHBhZCwgbGVmdCwgcmlnaHQpe1xuICAgICAgdGhpcy5fcGFkID0gcGFkO1xuICAgICAgdGhpcy5fbGVmdCA9IGxlZnQ7XG4gICAgICB0aGlzLl9yaWdodCA9IHJpZ2h0O1xuICAgIH0sXG4gICAgc3RhcnQ6IGZ1bmN0aW9uKCl7XG4gICAgICB0aGlzLnN0b3BwaW5nID0gZmFsc2U7XG4gICAgICB0aGlzLnVwZGF0ZSgpO1xuICAgIH0sXG4gICAgc3RvcDogZnVuY3Rpb24oKXtcbiAgICAgIHRoaXMuc3RvcHBpbmcgPSB0cnVlO1xuICAgIH0sXG4gICAgdXBkYXRlOiBmdW5jdGlvbigpe1xuICAgICAgdGhpcy5sZWZ0LnRleHRDb250ZW50ID0gdGhpcy5wYWQubGVmdFN0aWNrLnk7XG4gICAgICB0aGlzLnJpZ2h0LnRleHRDb250ZW50ID0gdGhpcy5wYWQucmlnaHRTdGljay55O1xuICAgICAgaWYoIXRoaXMuc3RvcHBpbmcpe1xuICAgICAgICB3aW5kb3cucmVxdWVzdEFuaW1hdGlvbkZyYW1lKCgpID0+IHtcbiAgICAgICAgICB0aGlzLnVwZGF0ZSgpO1xuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9LFxuICAgIGdldCBwYWQoKXtcbiAgICAgIHJldHVybiB0aGlzLl9wYWQ7XG4gICAgfSxcbiAgICBnZXQgbGVmdCgpe1xuICAgICAgcmV0dXJuIHRoaXMuX2xlZnQ7XG4gICAgfSxcbiAgICBnZXQgcmlnaHQoKXtcbiAgICAgIHJldHVybiB0aGlzLl9yaWdodDtcbiAgICB9ICAgIFxuICB9O1xuXG4gIG1vZHVsZS5leHBvcnRzID0gVGFua1ZpZXc7XG59KSgpO1xuIl19
