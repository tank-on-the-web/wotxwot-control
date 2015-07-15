(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
(function(){
  const SERVER_KEY = "server_ip";
  const INTERVAL = 200;

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
    get buttons() {
      return this.pad.buttons;
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJhcHAvanMvbWFpbi5qcyIsImFwcC9qcy9kcml2ZXIuanMiLCJhcHAvanMvbG9nZ2VyLmpzIiwiYXBwL2pzL3BhZC5qcyIsImFwcC9qcy90YW5rLXZpZXcuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM5RUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNoSEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDakNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2xFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBIiwiZmlsZSI6ImdlbmVyYXRlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24gZSh0LG4scil7ZnVuY3Rpb24gcyhvLHUpe2lmKCFuW29dKXtpZighdFtvXSl7dmFyIGE9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtpZighdSYmYSlyZXR1cm4gYShvLCEwKTtpZihpKXJldHVybiBpKG8sITApO3ZhciBmPW5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIrbytcIidcIik7dGhyb3cgZi5jb2RlPVwiTU9EVUxFX05PVF9GT1VORFwiLGZ9dmFyIGw9bltvXT17ZXhwb3J0czp7fX07dFtvXVswXS5jYWxsKGwuZXhwb3J0cyxmdW5jdGlvbihlKXt2YXIgbj10W29dWzFdW2VdO3JldHVybiBzKG4/bjplKX0sbCxsLmV4cG9ydHMsZSx0LG4scil9cmV0dXJuIG5bb10uZXhwb3J0c312YXIgaT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2Zvcih2YXIgbz0wO288ci5sZW5ndGg7bysrKXMocltvXSk7cmV0dXJuIHN9KSIsIihmdW5jdGlvbigpe1xuICBjb25zdCBTRVJWRVJfS0VZID0gXCJzZXJ2ZXJfaXBcIjtcbiAgY29uc3QgSU5URVJWQUwgPSAyMDA7XG5cbiAgdmFyIExvZ2dlciA9IHJlcXVpcmUoXCIuL2xvZ2dlclwiKTtcbiAgdmFyIFBhZCA9IHJlcXVpcmUoXCIuL3BhZFwiKTtcbiAgdmFyIERyaXZlciA9IHJlcXVpcmUoXCIuL2RyaXZlclwiKTtcbiAgdmFyIFRhbmtWaWV3ID0gcmVxdWlyZShcIi4vdGFuay12aWV3XCIpO1xuXG4gIHZhciBhcHAgPSB7fTtcblxuICB2YXIgbG9nID0gZnVuY3Rpb24odGV4dCl7XG4gICAgaWYoYXBwLmxvZ2dlcil7XG4gICAgICBhcHAubG9nZ2VyLmxvZyh0ZXh0KTtcbiAgICB9ZWxzZXtcbiAgICAgIGNvbnNvbGUubG9nKHRleHQpO1xuICAgIH1cbiAgfTtcblxuICB2YXIgY3JlYXRlVGFua1ZpZXcgPSBmdW5jdGlvbihwYWQpe1xuICAgIHZhciBsZWZ0ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihcIiNsZWZ0XCIpO1xuICAgIHZhciByaWdodCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoXCIjcmlnaHRcIik7XG4gICAgcmV0dXJuIG5ldyBUYW5rVmlldyhwYWQsIGxlZnQsIHJpZ2h0KTtcbiAgfTtcblxuICB2YXIgcGFkQ29ubmVjdGVkID0gZnVuY3Rpb24oZXZlbnQpe1xuICAgIHZhciBwYWQgPSBldmVudC5nYW1lcGFkO1xuICAgIGlmKCFhcHAucGFkKXtcbiAgICAgIGxvZyhwYWQuaWQgKyBcImNvbm5lY3RlZFwiKTtcbiAgICAgIGFwcC5wYWQgPSBuZXcgUGFkKHBhZCk7XG4gICAgICBhcHAudGFua1ZpZXcgPSBjcmVhdGVUYW5rVmlldyhhcHAucGFkKTtcblxuICAgICAgYXBwLnBhZC5jYWxpYnJhdGUoKS50aGVuKCgpID0+e1xuICAgICAgICBhcHAuZHJpdmVyID0gbmV3IERyaXZlcihhcHAudXJsLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBhcHAucGFkLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBJTlRFUlZBTCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbG9nKTtcbiAgICAgICAgYXBwLmRyaXZlci5zdGFydCgpO1xuICAgICAgICBhcHAudGFua1ZpZXcuc3RhcnQoKTtcbiAgICAgIH0pO1xuICAgIH1cbiAgfTtcblxuICB2YXIgcGFkRGlzY29ubmVjdGVkID0gZnVuY3Rpb24oZXZlbnQpe1xuICAgIGFwcC5wYWQgPSBudWxsO1xuICB9O1xuXG4gIHZhciBvblNlcnZlckNoYW5nZWQgPSBmdW5jdGlvbihldmVudCl7XG4gICAgdmFyIHNlcnZlciA9IGFwcC5zZXJ2ZXJJbnB1dC52YWx1ZTtcbiAgICBhcHAudXJsID0gc2VydmVyO1xuICAgIHdpbmRvdy5sb2NhbFN0b3JhZ2Uuc2V0SXRlbShTRVJWRVJfS0VZLCBzZXJ2ZXIpO1xuICAgIGFwcC5kcml2ZXIucmVzdGFydChhcHAudXJsKTtcbiAgfTtcblxuICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcihcImxvYWRcIiwgZnVuY3Rpb24oKXtcbiAgICB2YXIgc2VydmVyID0gKHdpbmRvdy5sb2NhbFN0b3JhZ2UuZ2V0SXRlbShTRVJWRVJfS0VZKSB8fCBcIndzOi8vMTkyLjE2OC4xLjEvd3NcIik7XG4gICAgYXBwLnVybCA9IHNlcnZlcjtcbiAgICBhcHAuc2VydmVySW5wdXQgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKFwiI3NlcnZlclwiKTtcbiAgICBhcHAuc2VydmVySW5wdXQudmFsdWUgPSBzZXJ2ZXI7XG4gICAgYXBwLnNlcnZlcklucHV0Lm9uY2hhbmdlID0gb25TZXJ2ZXJDaGFuZ2VkO1xuXG4gICAgYXBwLmxvZ2dlciA9IG5ldyBMb2dnZXIoZG9jdW1lbnQucXVlcnlTZWxlY3RvcihcIiNsb2dcIikpO1xuXG5cbiAgICBsb2coXCJhcHAgc3RhcnRlZFwiKTtcbiAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcihcImdhbWVwYWRjb25uZWN0ZWRcIiwgXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcGFkQ29ubmVjdGVkKTtcbiAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcihcImdhbWVwYWRkaXNjb25uZWN0ZWRcIiwgXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcGFkRGlzY29ubmVjdGVkKTtcbiAgfSk7XG5cbiAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoXCJ1bmxvYWRcIiwgZnVuY3Rpb24oKXtcbiAgICBpZihhcHAuZHJpdmVyKXtcbiAgICAgIGFwcC5kcml2ZXIuc3RvcCgpO1xuICAgIH1cbiAgfSk7XG4gIFxufSkoKTtcbiIsIihmdW5jdGlvbigpe1xuICBXZWJTb2NrZXQgPSBXZWJTb2NrZXQgfHwgTW96V2ViU29ja2V0O1xuXG4gIHZhciBEcml2ZXIgPSBmdW5jdGlvbigpe1xuICAgIHRoaXMuaW5pdGlhbGl6ZS5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuICB9O1xuXG4gIHZhciBjcmVhdGVNZXNzYWdlID0gZnVuY3Rpb24ocGFkKXtcbiAgICB2YXIgZGF0YSA9IHtcbiAgICAgIGx2OiBwYWQubGVmdFN0aWNrLnksXG4gICAgICBydjogcGFkLnJpZ2h0U3RpY2sueVxuICAgIH07XG4gICAgdmFyIG1lc3NhZ2UgPSB7XG4gICAgICBtb3RvcjogZGF0YSxcbiAgICAgIGZpcmU6IHBhZC5idXR0b25zWzEwXS5wcmVzc2VkIHx8IHBhZC5idXR0b25zWzExXS5wcmVzc2VkXG4gICAgfTtcbiAgICByZXR1cm4gSlNPTi5zdHJpbmdpZnkobWVzc2FnZSk7XG4gIH07XG5cbiAgRHJpdmVyLnByb3RvdHlwZSA9IHtcbiAgICBpbml0aWFsaXplOiBmdW5jdGlvbihzZXJ2ZXIsIHBhZCwgaW50ZXJ2YWwsIGxvZyl7XG4gICAgICB0aGlzLl9zZXJ2ZXIgPSBzZXJ2ZXI7XG4gICAgICB0aGlzLl9wYWQgPSBwYWQ7XG4gICAgICB0aGlzLl9pbnRlcnZhbCA9IGludGVydmFsO1xuICAgICAgdGhpcy5fbG9nID0gbG9nO1xuICAgIH0sXG4gICAgc3RhcnQ6IGZ1bmN0aW9uKCl7XG4gICAgICBpZih0aGlzLnJlYWR5KXtcbiAgICAgICAgdGhpcy5sb2coXCJzdGFydCBkcml2ZXJcIik7XG4gICAgICAgIGlmICh0aGlzLnNlcnZlci5pbmRleE9mKFwid3M6Ly9cIikgPT09IDApIHtcbiAgICAgICAgICB0aGlzLmxvZyhcImNyZWF0aW5nIGEgc29ja2V0IHRvIFwiICsgdGhpcy5zZXJ2ZXIpO1xuICAgICAgICAgIHZhciBzb2NrZXQgPSBuZXcgV2ViU29ja2V0KHRoaXMuc2VydmVyKTtcbiAgICAgICAgICBzb2NrZXQub25vcGVuID0gKGV2ZW50KSA9PiB7XG4gICAgICAgICAgICB0aGlzLmxvZyhcIlNvY2tldCBpcyBvcGVuZWRcIik7XG4gICAgICAgICAgICB0aGlzLl9zb2NrZXQgPSBzb2NrZXQ7XG4gICAgICAgICAgICB0aGlzLnVwZGF0ZSgpO1xuICAgICAgICAgIH07XG4gICAgICAgICAgc29ja2V0Lm9uY2xvc2UgPSAoZXZlbnQpID0+IHtcbiAgICAgICAgICAgIHRoaXMuIGxvZyhcIlNvY2tldCBpcyBjbG9zZWRcIik7XG4gICAgICAgICAgICB0aGlzLl9zb2NrZXQgPSBudWxsO1xuICAgICAgICAgIH07XG4gICAgICAgICAgc29ja2V0LmVycm9yID0gKGV2ZW50KSA9PntcbiAgICAgICAgICAgIHRoaXMubG9nKGV2ZW50LmRhdGEpO1xuICAgICAgICAgIH07XG4gICAgICAgICAgc29ja2V0Lm9ubWVzc2FnZSA9IChldmVudCkgPT4ge1xuICAgICAgICAgICAgdGhpcy5sb2coZXZlbnQuZGF0YSk7XG4gICAgICAgICAgfTtcbiAgICAgICAgICB0aGlzLnNlbmRNZXNzYWdlID0gKCkgPT4ge1xuICAgICAgICAgICAgdmFyIG1zZyA9IGNyZWF0ZU1lc3NhZ2UodGhpcy5wYWQpO1xuICAgICAgICAgICAgdGhpcy5zb2NrZXQuc2VuZChtc2cpO1xuICAgICAgICAgIH07XG4gICAgICAgIH0gZWxzZSBpZiAodGhpcy5zZXJ2ZXIuaW5kZXhPZihcImh0dHA6Ly9cIikgPT09IDApIHtcbiAgICAgICAgICB0aGlzLmxvZyhcInNlcnZlciB1cmwgaXMgXCIgKyB0aGlzLnNlcnZlcik7XG4gICAgICAgICAgdGhpcy5faHR0cCA9IHRydWU7XG4gICAgICAgICAgdGhpcy5zZW5kTWVzc2FnZSA9ICgpID0+IHtcbiAgICAgICAgICAgIHZhciB1cmwgPSB0aGlzLnNlcnZlciArIFwiL3B1dD9sdj1cIiArIHRoaXMucGFkLmxlZnRTdGljay55ICsgXCImcnY9XCIgKyB0aGlzLnBhZC5yaWdodFN0aWNrLnk7XG4gICAgICAgICAgICAvLyB0aGlzLmxvZyh1cmwpO1xuICAgICAgICAgICAgdmFyIHhociA9IG5ldyBYTUxIdHRwUmVxdWVzdCgpO1xuICAgICAgICAgICAgeGhyLm9wZW4oXCJHRVRcIiwgdXJsKTtcbiAgICAgICAgICAgIHhoci5zZW5kKCk7XG4gICAgICAgICAgICB4aHIuYWRkRXZlbnRMaXN0ZW5lcihcImVycm9yXCIsIChldnQpID0+IHtcbiAgICAgICAgICAgICAgdGhpcy5sb2coXCJGYWlsZWQgdG8gc2VuZDogXCIgKyB1cmwpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLnVwZGF0ZSgpO1xuICAgICAgfVxuICAgIH0sXG4gICAgc3RvcDogZnVuY3Rpb24oKXtcbiAgICAgIGlmKHRoaXMuc29ja2V0KXtcbiAgICAgICAgdGhpcy5sb2coXCJzdG9wIGRyaXZlclwiKTtcbiAgICAgICAgdGhpcy5zb2NrZXQuY2xvc2UoKTtcbiAgICAgIH1cbiAgICB9LFxuICAgIHVwZGF0ZTogZnVuY3Rpb24oKXtcbiAgICAgIGlmKHRoaXMud29ya2luZyl7XG4gICAgICAgIHRoaXMuc2VuZE1lc3NhZ2UoKTtcbiAgICAgICAgd2luZG93LnNldFRpbWVvdXQoKCkgPT57XG4gICAgICAgICAgdGhpcy51cGRhdGUoKTtcbiAgICAgICAgfSwgdGhpcy5pbnRlcnZhbCk7XG4gICAgICB9XG4gICAgfSxcbiAgICByZXN0YXJ0OiBmdW5jdGlvbihzZXJ2ZXIpe1xuICAgICAgdGhpcy5fc2VydmVyID0gc2VydmVyO1xuICAgICAgdGhpcy5zdG9wKCk7XG4gICAgICB0aGlzLnN0YXJ0KCk7XG4gICAgfSxcbiAgICBnZXQgd29ya2luZygpe1xuICAgICAgcmV0dXJuIHRoaXMucGFkICE9IG51bGwgJiYgKHRoaXMuX2h0dHAgfHwgdGhpcy5zb2NrZXQgIT0gbnVsbCk7XG4gICAgfSxcbiAgICBnZXQgbG9nKCl7XG4gICAgICByZXR1cm4gdGhpcy5fbG9nIHx8IGNvbnNvbGUubG9nO1xuICAgIH0sXG4gICAgZ2V0IHNvY2tldCgpe1xuICAgICAgcmV0dXJuIHRoaXMuX3NvY2tldDtcbiAgICB9LFxuICAgIGdldCByZWFkeSgpe1xuICAgICAgcmV0dXJuIHRoaXMuc2VydmVyICE9IG51bGwgJiYgdGhpcy5wYWQgIT0gbnVsbCAmJiB0aGlzLnNvY2tldCA9PSBudWxsO1xuICAgIH0sXG4gICAgZ2V0IGludGVydmFsKCl7XG4gICAgICByZXR1cm4gdGhpcy5faW50ZXJ2YWw7XG4gICAgfSxcbiAgICBnZXQgcGFkKCl7XG4gICAgICByZXR1cm4gdGhpcy5fcGFkO1xuICAgIH0sXG4gICAgZ2V0IHNlcnZlcigpe1xuICAgICAgcmV0dXJuIHRoaXMuX3NlcnZlcjtcbiAgICB9XG4gIH07XG4gIFxuICBtb2R1bGUuZXhwb3J0cyA9IERyaXZlcjtcbn0pKCk7XG4iLCIoZnVuY3Rpb24oKXtcblxuICB2YXIgY3JlYXRlTG9nTGluZSA9IGZ1bmN0aW9uKHRleHQpe1xuICAgIHZhciBwID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcInBcIik7XG4gICAgcC50ZXh0Q29udGVudCA9IHRleHQ7XG4gICAgcmV0dXJuIHA7XG4gIH07XG5cbiAgdmFyIExvZ2dlciA9IGZ1bmN0aW9uKCl7XG4gICAgdGhpcy5pbml0aWFsaXplLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG4gIH07XG5cbiAgTG9nZ2VyLnByb3RvdHlwZSA9IHtcbiAgICBpbml0aWFsaXplOiBmdW5jdGlvbihlbG0pe1xuICAgICAgdGhpcy5fZWxtID0gZWxtO1xuICAgIH0sXG4gICAgbG9nOiBmdW5jdGlvbih0ZXh0KXtcbiAgICAgIHZhciBuZXdsb2cgPSBjcmVhdGVMb2dMaW5lKHRleHQpO1xuICAgICAgaWYodGhpcy5fbGF0ZXN0KXtcbiAgICAgICAgdGhpcy5lbG0uaW5zZXJ0QmVmb3JlKG5ld2xvZywgdGhpcy5fbGF0ZXN0KTtcbiAgICAgIH1lbHNle1xuICAgICAgICB0aGlzLmVsbS5hcHBlbmRDaGlsZChuZXdsb2cpO1xuICAgICAgfVxuICAgICAgdGhpcy5fbGF0ZXN0ID0gbmV3bG9nO1xuICAgIH0sXG4gICAgZ2V0IGVsbSgpe1xuICAgICAgcmV0dXJuIHRoaXMuX2VsbTtcbiAgICB9XG4gIH07XG5cbiAgbW9kdWxlLmV4cG9ydHMgPSBMb2dnZXI7XG5cbn0pKCk7XG4iLCIoZnVuY3Rpb24oKXtcblxuICBjb25zdCBBVFRFTVBUUyA9IDEwMDtcblxuICB2YXIgbm9ybWFsaXplQXhpcyA9IGZ1bmN0aW9uKHZhbHVlKXtcbiAgICByZXR1cm4gTWF0aC5taW4oTWF0aC5tYXgoTWF0aC5mbG9vcih2YWx1ZSAqIDEwMCksIC0xMDApLCAxMDApO1xuICB9O1xuXG4gIHZhciBQYWQgPSBmdW5jdGlvbigpe1xuICAgIHRoaXMuaW5pdGlhbGl6ZS5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuICB9O1xuXG4gIFBhZC5wcm90b3R5cGUgPSB7XG4gICAgaW5pdGlhbGl6ZTogZnVuY3Rpb24ocGFkKXtcbiAgICAgIHRoaXMuX3BhZCA9IHBhZDtcbiAgICAgIHRoaXMuX2F4ZXNCYXNlTGluZSA9IHBhZC5heGVzLm1hcCgoKSA9PntcbiAgICAgICAgcmV0dXJuIDA7XG4gICAgICB9KTtcbiAgICB9LFxuICAgIGNhbGlicmF0ZTogZnVuY3Rpb24oKXtcbiAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgICAgIHZhciBidWYgPSBbXTtcbiAgICAgICAgZm9yKHZhciBpID0gMDsgaSA8IEFUVEVNUFRTOyBpKyspe1xuICAgICAgICAgIGZvcih2YXIgaiA9IDA7IGogPCB0aGlzLnBhZC5heGVzLmxlbmd0aDsgaisrKXtcbiAgICAgICAgICAgIGJ1ZltqXSA9IChidWZbal0gfHwgMCkgKyB0aGlzLnBhZC5heGVzW2pdO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICB0aGlzLl9heGVzQmFzZUxpbmUgPSAgYnVmLm1hcCh2YWx1ZSA9PiB7XG4gICAgICAgICAgcmV0dXJuIHZhbHVlIC8gQVRURU1QVFM7XG4gICAgICAgIH0pO1xuICAgICAgICByZXNvbHZlKHRoaXMpO1xuICAgICAgfSk7XG4gICAgfSxcbiAgICBnZXQgaWQoKXtcbiAgICAgIHJldHVybiB0aGlzLnBhZC5pZDtcbiAgICB9LFxuICAgIGdldCBidXR0b25zKCkge1xuICAgICAgcmV0dXJuIHRoaXMucGFkLmJ1dHRvbnM7XG4gICAgfSxcbiAgICBnZXQgYXhlcygpe1xuICAgICAgdmFyIHJldCA9IFtdO1xuICAgICAgZm9yKHZhciBpID0gMDsgaSA8IHRoaXMucGFkLmF4ZXMubGVuZ3RoOyBpKyspe1xuICAgICAgICByZXRbaV0gPSBub3JtYWxpemVBeGlzKHRoaXMucGFkLmF4ZXNbaV0gLSAodGhpcy5fYXhlc0Jhc2VMaW5lW2ldIHx8IDApKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiByZXQ7XG4gICAgfSxcbiAgICBnZXQgcGFkKCl7XG4gICAgICByZXR1cm4gdGhpcy5fcGFkO1xuICAgIH0sXG4gICAgZ2V0IHJpZ2h0U3RpY2soKXtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHg6IHRoaXMuYXhlc1syXSxcbiAgICAgICAgeTogdGhpcy5heGVzWzNdXG4gICAgICB9OyAgICAgIFxuICAgIH0sXG4gICAgZ2V0IGxlZnRTdGljaygpe1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgeDogdGhpcy5heGVzWzBdLFxuICAgICAgICB5OiB0aGlzLmF4ZXNbMV1cbiAgICAgIH07XG4gICAgfVxuICB9O1xuXG4gIG1vZHVsZS5leHBvcnRzID0gUGFkO1xuXG59KSgpO1xuIiwiKGZ1bmN0aW9uKCl7XG4gIHZhciBUYW5rVmlldyA9IGZ1bmN0aW9uKCl7XG4gICAgdGhpcy5pbml0aWFsaXplLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG4gIH07XG5cbiAgVGFua1ZpZXcucHJvdG90eXBlID17XG4gICAgaW5pdGlhbGl6ZTogZnVuY3Rpb24ocGFkLCBsZWZ0LCByaWdodCl7XG4gICAgICB0aGlzLl9wYWQgPSBwYWQ7XG4gICAgICB0aGlzLl9sZWZ0ID0gbGVmdDtcbiAgICAgIHRoaXMuX3JpZ2h0ID0gcmlnaHQ7XG4gICAgfSxcbiAgICBzdGFydDogZnVuY3Rpb24oKXtcbiAgICAgIHRoaXMuc3RvcHBpbmcgPSBmYWxzZTtcbiAgICAgIHRoaXMudXBkYXRlKCk7XG4gICAgfSxcbiAgICBzdG9wOiBmdW5jdGlvbigpe1xuICAgICAgdGhpcy5zdG9wcGluZyA9IHRydWU7XG4gICAgfSxcbiAgICB1cGRhdGU6IGZ1bmN0aW9uKCl7XG4gICAgICB0aGlzLmxlZnQudGV4dENvbnRlbnQgPSB0aGlzLnBhZC5sZWZ0U3RpY2sueTtcbiAgICAgIHRoaXMucmlnaHQudGV4dENvbnRlbnQgPSB0aGlzLnBhZC5yaWdodFN0aWNrLnk7XG4gICAgICBpZighdGhpcy5zdG9wcGluZyl7XG4gICAgICAgIHdpbmRvdy5yZXF1ZXN0QW5pbWF0aW9uRnJhbWUoKCkgPT4ge1xuICAgICAgICAgIHRoaXMudXBkYXRlKCk7XG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH0sXG4gICAgZ2V0IHBhZCgpe1xuICAgICAgcmV0dXJuIHRoaXMuX3BhZDtcbiAgICB9LFxuICAgIGdldCBsZWZ0KCl7XG4gICAgICByZXR1cm4gdGhpcy5fbGVmdDtcbiAgICB9LFxuICAgIGdldCByaWdodCgpe1xuICAgICAgcmV0dXJuIHRoaXMuX3JpZ2h0O1xuICAgIH0gICAgXG4gIH07XG5cbiAgbW9kdWxlLmV4cG9ydHMgPSBUYW5rVmlldztcbn0pKCk7XG4iXX0=
