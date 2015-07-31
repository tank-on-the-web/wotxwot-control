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
    if (app.driver) {
      app.driver.restart(app.url);
    }
  };

  window.addEventListener("load", function(){
    var server = (window.localStorage.getItem(SERVER_KEY) || "ws://192.168.1.1/ws");
    app.url = server;
    app.serverInput = document.querySelector("#server");
    app.serverInput.value = server;
    app.serverInput.onchange = onServerChanged;

    app.logger = new Logger(document.querySelector("#log"));

    document.getElementById('open-tank-view').onclick = function () {
      var tankView = document.getElementById('tank-view');
      var ctrlView = document.getElementById('ctrl-view');
      tankView.style.display = 'block';
      ctrlView.style.display = 'none';

      var url = document.createElement('a');
      var iframe = tankView.querySelector('iframe');
      url.href = app.url;
      iframe.src = 'http://' + url.hostname + ':7080';
      document.addEventListener('keydown', function onKeyDown(evt) {
        if (evt.key === 'Enter')
        // close it!
        iframe.src = '';
        tankView.style.display = 'none';
        ctrlView.style.display = 'block';
        document.removeEventListener('keydown', onKeyDown);
      });
    }

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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJhcHAvanMvbWFpbi5qcyIsImFwcC9qcy9kcml2ZXIuanMiLCJhcHAvanMvbG9nZ2VyLmpzIiwiYXBwL2pzL3BhZC5qcyIsImFwcC9qcy90YW5rLXZpZXcuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNoSEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDakNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2xFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBIiwiZmlsZSI6ImdlbmVyYXRlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24gZSh0LG4scil7ZnVuY3Rpb24gcyhvLHUpe2lmKCFuW29dKXtpZighdFtvXSl7dmFyIGE9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtpZighdSYmYSlyZXR1cm4gYShvLCEwKTtpZihpKXJldHVybiBpKG8sITApO3ZhciBmPW5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIrbytcIidcIik7dGhyb3cgZi5jb2RlPVwiTU9EVUxFX05PVF9GT1VORFwiLGZ9dmFyIGw9bltvXT17ZXhwb3J0czp7fX07dFtvXVswXS5jYWxsKGwuZXhwb3J0cyxmdW5jdGlvbihlKXt2YXIgbj10W29dWzFdW2VdO3JldHVybiBzKG4/bjplKX0sbCxsLmV4cG9ydHMsZSx0LG4scil9cmV0dXJuIG5bb10uZXhwb3J0c312YXIgaT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2Zvcih2YXIgbz0wO288ci5sZW5ndGg7bysrKXMocltvXSk7cmV0dXJuIHN9KSIsIihmdW5jdGlvbigpe1xuICBjb25zdCBTRVJWRVJfS0VZID0gXCJzZXJ2ZXJfaXBcIjtcbiAgY29uc3QgSU5URVJWQUwgPSAyMDA7XG5cbiAgdmFyIExvZ2dlciA9IHJlcXVpcmUoXCIuL2xvZ2dlclwiKTtcbiAgdmFyIFBhZCA9IHJlcXVpcmUoXCIuL3BhZFwiKTtcbiAgdmFyIERyaXZlciA9IHJlcXVpcmUoXCIuL2RyaXZlclwiKTtcbiAgdmFyIFRhbmtWaWV3ID0gcmVxdWlyZShcIi4vdGFuay12aWV3XCIpO1xuXG4gIHZhciBhcHAgPSB7fTtcblxuICB2YXIgbG9nID0gZnVuY3Rpb24odGV4dCl7XG4gICAgaWYoYXBwLmxvZ2dlcil7XG4gICAgICBhcHAubG9nZ2VyLmxvZyh0ZXh0KTtcbiAgICB9ZWxzZXtcbiAgICAgIGNvbnNvbGUubG9nKHRleHQpO1xuICAgIH1cbiAgfTtcblxuICB2YXIgY3JlYXRlVGFua1ZpZXcgPSBmdW5jdGlvbihwYWQpe1xuICAgIHZhciBsZWZ0ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihcIiNsZWZ0XCIpO1xuICAgIHZhciByaWdodCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoXCIjcmlnaHRcIik7XG4gICAgcmV0dXJuIG5ldyBUYW5rVmlldyhwYWQsIGxlZnQsIHJpZ2h0KTtcbiAgfTtcblxuICB2YXIgcGFkQ29ubmVjdGVkID0gZnVuY3Rpb24oZXZlbnQpe1xuICAgIHZhciBwYWQgPSBldmVudC5nYW1lcGFkO1xuICAgIGlmKCFhcHAucGFkKXtcbiAgICAgIGxvZyhwYWQuaWQgKyBcImNvbm5lY3RlZFwiKTtcbiAgICAgIGFwcC5wYWQgPSBuZXcgUGFkKHBhZCk7XG4gICAgICBhcHAudGFua1ZpZXcgPSBjcmVhdGVUYW5rVmlldyhhcHAucGFkKTtcblxuICAgICAgYXBwLnBhZC5jYWxpYnJhdGUoKS50aGVuKCgpID0+e1xuICAgICAgICBhcHAuZHJpdmVyID0gbmV3IERyaXZlcihhcHAudXJsLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBhcHAucGFkLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBJTlRFUlZBTCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbG9nKTtcbiAgICAgICAgYXBwLmRyaXZlci5zdGFydCgpO1xuICAgICAgICBhcHAudGFua1ZpZXcuc3RhcnQoKTtcbiAgICAgIH0pO1xuICAgIH1cbiAgfTtcblxuICB2YXIgcGFkRGlzY29ubmVjdGVkID0gZnVuY3Rpb24oZXZlbnQpe1xuICAgIGFwcC5wYWQgPSBudWxsO1xuICB9O1xuXG4gIHZhciBvblNlcnZlckNoYW5nZWQgPSBmdW5jdGlvbihldmVudCl7XG4gICAgdmFyIHNlcnZlciA9IGFwcC5zZXJ2ZXJJbnB1dC52YWx1ZTtcbiAgICBhcHAudXJsID0gc2VydmVyO1xuICAgIHdpbmRvdy5sb2NhbFN0b3JhZ2Uuc2V0SXRlbShTRVJWRVJfS0VZLCBzZXJ2ZXIpO1xuICAgIGlmIChhcHAuZHJpdmVyKSB7XG4gICAgICBhcHAuZHJpdmVyLnJlc3RhcnQoYXBwLnVybCk7XG4gICAgfVxuICB9O1xuXG4gIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKFwibG9hZFwiLCBmdW5jdGlvbigpe1xuICAgIHZhciBzZXJ2ZXIgPSAod2luZG93LmxvY2FsU3RvcmFnZS5nZXRJdGVtKFNFUlZFUl9LRVkpIHx8IFwid3M6Ly8xOTIuMTY4LjEuMS93c1wiKTtcbiAgICBhcHAudXJsID0gc2VydmVyO1xuICAgIGFwcC5zZXJ2ZXJJbnB1dCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoXCIjc2VydmVyXCIpO1xuICAgIGFwcC5zZXJ2ZXJJbnB1dC52YWx1ZSA9IHNlcnZlcjtcbiAgICBhcHAuc2VydmVySW5wdXQub25jaGFuZ2UgPSBvblNlcnZlckNoYW5nZWQ7XG5cbiAgICBhcHAubG9nZ2VyID0gbmV3IExvZ2dlcihkb2N1bWVudC5xdWVyeVNlbGVjdG9yKFwiI2xvZ1wiKSk7XG5cbiAgICBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgnb3Blbi10YW5rLXZpZXcnKS5vbmNsaWNrID0gZnVuY3Rpb24gKCkge1xuICAgICAgdmFyIHRhbmtWaWV3ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3RhbmstdmlldycpO1xuICAgICAgdmFyIGN0cmxWaWV3ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ2N0cmwtdmlldycpO1xuICAgICAgdGFua1ZpZXcuc3R5bGUuZGlzcGxheSA9ICdibG9jayc7XG4gICAgICBjdHJsVmlldy5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXG4gICAgICB2YXIgdXJsID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnYScpO1xuICAgICAgdmFyIGlmcmFtZSA9IHRhbmtWaWV3LnF1ZXJ5U2VsZWN0b3IoJ2lmcmFtZScpO1xuICAgICAgdXJsLmhyZWYgPSBhcHAudXJsO1xuICAgICAgaWZyYW1lLnNyYyA9ICdodHRwOi8vJyArIHVybC5ob3N0bmFtZSArICc6NzA4MCc7XG4gICAgICBkb2N1bWVudC5hZGRFdmVudExpc3RlbmVyKCdrZXlkb3duJywgZnVuY3Rpb24gb25LZXlEb3duKGV2dCkge1xuICAgICAgICBpZiAoZXZ0LmtleSA9PT0gJ0VudGVyJylcbiAgICAgICAgLy8gY2xvc2UgaXQhXG4gICAgICAgIGlmcmFtZS5zcmMgPSAnJztcbiAgICAgICAgdGFua1ZpZXcuc3R5bGUuZGlzcGxheSA9ICdub25lJztcbiAgICAgICAgY3RybFZpZXcuc3R5bGUuZGlzcGxheSA9ICdibG9jayc7XG4gICAgICAgIGRvY3VtZW50LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ2tleWRvd24nLCBvbktleURvd24pO1xuICAgICAgfSk7XG4gICAgfVxuXG4gICAgbG9nKFwiYXBwIHN0YXJ0ZWRcIik7XG4gICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoXCJnYW1lcGFkY29ubmVjdGVkXCIsIFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHBhZENvbm5lY3RlZCk7XG4gICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoXCJnYW1lcGFkZGlzY29ubmVjdGVkXCIsIFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHBhZERpc2Nvbm5lY3RlZCk7XG4gIH0pO1xuXG4gIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKFwidW5sb2FkXCIsIGZ1bmN0aW9uKCl7XG4gICAgaWYoYXBwLmRyaXZlcil7XG4gICAgICBhcHAuZHJpdmVyLnN0b3AoKTtcbiAgICB9XG4gIH0pO1xuICBcbn0pKCk7XG4iLCIoZnVuY3Rpb24oKXtcbiAgV2ViU29ja2V0ID0gV2ViU29ja2V0IHx8IE1veldlYlNvY2tldDtcblxuICB2YXIgRHJpdmVyID0gZnVuY3Rpb24oKXtcbiAgICB0aGlzLmluaXRpYWxpemUuYXBwbHkodGhpcywgYXJndW1lbnRzKTtcbiAgfTtcblxuICB2YXIgY3JlYXRlTWVzc2FnZSA9IGZ1bmN0aW9uKHBhZCl7XG4gICAgdmFyIGRhdGEgPSB7XG4gICAgICBsdjogcGFkLmxlZnRTdGljay55LFxuICAgICAgcnY6IHBhZC5yaWdodFN0aWNrLnlcbiAgICB9O1xuICAgIHZhciBtZXNzYWdlID0ge1xuICAgICAgbW90b3I6IGRhdGEsXG4gICAgICBmaXJlOiBwYWQuYnV0dG9uc1sxMF0ucHJlc3NlZCB8fCBwYWQuYnV0dG9uc1sxMV0ucHJlc3NlZFxuICAgIH07XG4gICAgcmV0dXJuIEpTT04uc3RyaW5naWZ5KG1lc3NhZ2UpO1xuICB9O1xuXG4gIERyaXZlci5wcm90b3R5cGUgPSB7XG4gICAgaW5pdGlhbGl6ZTogZnVuY3Rpb24oc2VydmVyLCBwYWQsIGludGVydmFsLCBsb2cpe1xuICAgICAgdGhpcy5fc2VydmVyID0gc2VydmVyO1xuICAgICAgdGhpcy5fcGFkID0gcGFkO1xuICAgICAgdGhpcy5faW50ZXJ2YWwgPSBpbnRlcnZhbDtcbiAgICAgIHRoaXMuX2xvZyA9IGxvZztcbiAgICB9LFxuICAgIHN0YXJ0OiBmdW5jdGlvbigpe1xuICAgICAgaWYodGhpcy5yZWFkeSl7XG4gICAgICAgIHRoaXMubG9nKFwic3RhcnQgZHJpdmVyXCIpO1xuICAgICAgICBpZiAodGhpcy5zZXJ2ZXIuaW5kZXhPZihcIndzOi8vXCIpID09PSAwKSB7XG4gICAgICAgICAgdGhpcy5sb2coXCJjcmVhdGluZyBhIHNvY2tldCB0byBcIiArIHRoaXMuc2VydmVyKTtcbiAgICAgICAgICB2YXIgc29ja2V0ID0gbmV3IFdlYlNvY2tldCh0aGlzLnNlcnZlcik7XG4gICAgICAgICAgc29ja2V0Lm9ub3BlbiA9IChldmVudCkgPT4ge1xuICAgICAgICAgICAgdGhpcy5sb2coXCJTb2NrZXQgaXMgb3BlbmVkXCIpO1xuICAgICAgICAgICAgdGhpcy5fc29ja2V0ID0gc29ja2V0O1xuICAgICAgICAgICAgdGhpcy51cGRhdGUoKTtcbiAgICAgICAgICB9O1xuICAgICAgICAgIHNvY2tldC5vbmNsb3NlID0gKGV2ZW50KSA9PiB7XG4gICAgICAgICAgICB0aGlzLiBsb2coXCJTb2NrZXQgaXMgY2xvc2VkXCIpO1xuICAgICAgICAgICAgdGhpcy5fc29ja2V0ID0gbnVsbDtcbiAgICAgICAgICB9O1xuICAgICAgICAgIHNvY2tldC5lcnJvciA9IChldmVudCkgPT57XG4gICAgICAgICAgICB0aGlzLmxvZyhldmVudC5kYXRhKTtcbiAgICAgICAgICB9O1xuICAgICAgICAgIHNvY2tldC5vbm1lc3NhZ2UgPSAoZXZlbnQpID0+IHtcbiAgICAgICAgICAgIHRoaXMubG9nKGV2ZW50LmRhdGEpO1xuICAgICAgICAgIH07XG4gICAgICAgICAgdGhpcy5zZW5kTWVzc2FnZSA9ICgpID0+IHtcbiAgICAgICAgICAgIHZhciBtc2cgPSBjcmVhdGVNZXNzYWdlKHRoaXMucGFkKTtcbiAgICAgICAgICAgIHRoaXMuc29ja2V0LnNlbmQobXNnKTtcbiAgICAgICAgICB9O1xuICAgICAgICB9IGVsc2UgaWYgKHRoaXMuc2VydmVyLmluZGV4T2YoXCJodHRwOi8vXCIpID09PSAwKSB7XG4gICAgICAgICAgdGhpcy5sb2coXCJzZXJ2ZXIgdXJsIGlzIFwiICsgdGhpcy5zZXJ2ZXIpO1xuICAgICAgICAgIHRoaXMuX2h0dHAgPSB0cnVlO1xuICAgICAgICAgIHRoaXMuc2VuZE1lc3NhZ2UgPSAoKSA9PiB7XG4gICAgICAgICAgICB2YXIgdXJsID0gdGhpcy5zZXJ2ZXIgKyBcIi9wdXQ/bHY9XCIgKyB0aGlzLnBhZC5sZWZ0U3RpY2sueSArIFwiJnJ2PVwiICsgdGhpcy5wYWQucmlnaHRTdGljay55O1xuICAgICAgICAgICAgLy8gdGhpcy5sb2codXJsKTtcbiAgICAgICAgICAgIHZhciB4aHIgPSBuZXcgWE1MSHR0cFJlcXVlc3QoKTtcbiAgICAgICAgICAgIHhoci5vcGVuKFwiR0VUXCIsIHVybCk7XG4gICAgICAgICAgICB4aHIuc2VuZCgpO1xuICAgICAgICAgICAgeGhyLmFkZEV2ZW50TGlzdGVuZXIoXCJlcnJvclwiLCAoZXZ0KSA9PiB7XG4gICAgICAgICAgICAgIHRoaXMubG9nKFwiRmFpbGVkIHRvIHNlbmQ6IFwiICsgdXJsKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH07XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy51cGRhdGUoKTtcbiAgICAgIH1cbiAgICB9LFxuICAgIHN0b3A6IGZ1bmN0aW9uKCl7XG4gICAgICBpZih0aGlzLnNvY2tldCl7XG4gICAgICAgIHRoaXMubG9nKFwic3RvcCBkcml2ZXJcIik7XG4gICAgICAgIHRoaXMuc29ja2V0LmNsb3NlKCk7XG4gICAgICB9XG4gICAgfSxcbiAgICB1cGRhdGU6IGZ1bmN0aW9uKCl7XG4gICAgICBpZih0aGlzLndvcmtpbmcpe1xuICAgICAgICB0aGlzLnNlbmRNZXNzYWdlKCk7XG4gICAgICAgIHdpbmRvdy5zZXRUaW1lb3V0KCgpID0+e1xuICAgICAgICAgIHRoaXMudXBkYXRlKCk7XG4gICAgICAgIH0sIHRoaXMuaW50ZXJ2YWwpO1xuICAgICAgfVxuICAgIH0sXG4gICAgcmVzdGFydDogZnVuY3Rpb24oc2VydmVyKXtcbiAgICAgIHRoaXMuX3NlcnZlciA9IHNlcnZlcjtcbiAgICAgIHRoaXMuc3RvcCgpO1xuICAgICAgdGhpcy5zdGFydCgpO1xuICAgIH0sXG4gICAgZ2V0IHdvcmtpbmcoKXtcbiAgICAgIHJldHVybiB0aGlzLnBhZCAhPSBudWxsICYmICh0aGlzLl9odHRwIHx8IHRoaXMuc29ja2V0ICE9IG51bGwpO1xuICAgIH0sXG4gICAgZ2V0IGxvZygpe1xuICAgICAgcmV0dXJuIHRoaXMuX2xvZyB8fCBjb25zb2xlLmxvZztcbiAgICB9LFxuICAgIGdldCBzb2NrZXQoKXtcbiAgICAgIHJldHVybiB0aGlzLl9zb2NrZXQ7XG4gICAgfSxcbiAgICBnZXQgcmVhZHkoKXtcbiAgICAgIHJldHVybiB0aGlzLnNlcnZlciAhPSBudWxsICYmIHRoaXMucGFkICE9IG51bGwgJiYgdGhpcy5zb2NrZXQgPT0gbnVsbDtcbiAgICB9LFxuICAgIGdldCBpbnRlcnZhbCgpe1xuICAgICAgcmV0dXJuIHRoaXMuX2ludGVydmFsO1xuICAgIH0sXG4gICAgZ2V0IHBhZCgpe1xuICAgICAgcmV0dXJuIHRoaXMuX3BhZDtcbiAgICB9LFxuICAgIGdldCBzZXJ2ZXIoKXtcbiAgICAgIHJldHVybiB0aGlzLl9zZXJ2ZXI7XG4gICAgfVxuICB9O1xuICBcbiAgbW9kdWxlLmV4cG9ydHMgPSBEcml2ZXI7XG59KSgpO1xuIiwiKGZ1bmN0aW9uKCl7XG5cbiAgdmFyIGNyZWF0ZUxvZ0xpbmUgPSBmdW5jdGlvbih0ZXh0KXtcbiAgICB2YXIgcCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJwXCIpO1xuICAgIHAudGV4dENvbnRlbnQgPSB0ZXh0O1xuICAgIHJldHVybiBwO1xuICB9O1xuXG4gIHZhciBMb2dnZXIgPSBmdW5jdGlvbigpe1xuICAgIHRoaXMuaW5pdGlhbGl6ZS5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuICB9O1xuXG4gIExvZ2dlci5wcm90b3R5cGUgPSB7XG4gICAgaW5pdGlhbGl6ZTogZnVuY3Rpb24oZWxtKXtcbiAgICAgIHRoaXMuX2VsbSA9IGVsbTtcbiAgICB9LFxuICAgIGxvZzogZnVuY3Rpb24odGV4dCl7XG4gICAgICB2YXIgbmV3bG9nID0gY3JlYXRlTG9nTGluZSh0ZXh0KTtcbiAgICAgIGlmKHRoaXMuX2xhdGVzdCl7XG4gICAgICAgIHRoaXMuZWxtLmluc2VydEJlZm9yZShuZXdsb2csIHRoaXMuX2xhdGVzdCk7XG4gICAgICB9ZWxzZXtcbiAgICAgICAgdGhpcy5lbG0uYXBwZW5kQ2hpbGQobmV3bG9nKTtcbiAgICAgIH1cbiAgICAgIHRoaXMuX2xhdGVzdCA9IG5ld2xvZztcbiAgICB9LFxuICAgIGdldCBlbG0oKXtcbiAgICAgIHJldHVybiB0aGlzLl9lbG07XG4gICAgfVxuICB9O1xuXG4gIG1vZHVsZS5leHBvcnRzID0gTG9nZ2VyO1xuXG59KSgpO1xuIiwiKGZ1bmN0aW9uKCl7XG5cbiAgY29uc3QgQVRURU1QVFMgPSAxMDA7XG5cbiAgdmFyIG5vcm1hbGl6ZUF4aXMgPSBmdW5jdGlvbih2YWx1ZSl7XG4gICAgcmV0dXJuIE1hdGgubWluKE1hdGgubWF4KE1hdGguZmxvb3IodmFsdWUgKiAxMDApLCAtMTAwKSwgMTAwKTtcbiAgfTtcblxuICB2YXIgUGFkID0gZnVuY3Rpb24oKXtcbiAgICB0aGlzLmluaXRpYWxpemUuYXBwbHkodGhpcywgYXJndW1lbnRzKTtcbiAgfTtcblxuICBQYWQucHJvdG90eXBlID0ge1xuICAgIGluaXRpYWxpemU6IGZ1bmN0aW9uKHBhZCl7XG4gICAgICB0aGlzLl9wYWQgPSBwYWQ7XG4gICAgICB0aGlzLl9heGVzQmFzZUxpbmUgPSBwYWQuYXhlcy5tYXAoKCkgPT57XG4gICAgICAgIHJldHVybiAwO1xuICAgICAgfSk7XG4gICAgfSxcbiAgICBjYWxpYnJhdGU6IGZ1bmN0aW9uKCl7XG4gICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgICB2YXIgYnVmID0gW107XG4gICAgICAgIGZvcih2YXIgaSA9IDA7IGkgPCBBVFRFTVBUUzsgaSsrKXtcbiAgICAgICAgICBmb3IodmFyIGogPSAwOyBqIDwgdGhpcy5wYWQuYXhlcy5sZW5ndGg7IGorKyl7XG4gICAgICAgICAgICBidWZbal0gPSAoYnVmW2pdIHx8IDApICsgdGhpcy5wYWQuYXhlc1tqXTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5fYXhlc0Jhc2VMaW5lID0gIGJ1Zi5tYXAodmFsdWUgPT4ge1xuICAgICAgICAgIHJldHVybiB2YWx1ZSAvIEFUVEVNUFRTO1xuICAgICAgICB9KTtcbiAgICAgICAgcmVzb2x2ZSh0aGlzKTtcbiAgICAgIH0pO1xuICAgIH0sXG4gICAgZ2V0IGlkKCl7XG4gICAgICByZXR1cm4gdGhpcy5wYWQuaWQ7XG4gICAgfSxcbiAgICBnZXQgYnV0dG9ucygpIHtcbiAgICAgIHJldHVybiB0aGlzLnBhZC5idXR0b25zO1xuICAgIH0sXG4gICAgZ2V0IGF4ZXMoKXtcbiAgICAgIHZhciByZXQgPSBbXTtcbiAgICAgIGZvcih2YXIgaSA9IDA7IGkgPCB0aGlzLnBhZC5heGVzLmxlbmd0aDsgaSsrKXtcbiAgICAgICAgcmV0W2ldID0gbm9ybWFsaXplQXhpcyh0aGlzLnBhZC5heGVzW2ldIC0gKHRoaXMuX2F4ZXNCYXNlTGluZVtpXSB8fCAwKSk7XG4gICAgICB9XG4gICAgICByZXR1cm4gcmV0O1xuICAgIH0sXG4gICAgZ2V0IHBhZCgpe1xuICAgICAgcmV0dXJuIHRoaXMuX3BhZDtcbiAgICB9LFxuICAgIGdldCByaWdodFN0aWNrKCl7XG4gICAgICByZXR1cm4ge1xuICAgICAgICB4OiB0aGlzLmF4ZXNbMl0sXG4gICAgICAgIHk6IHRoaXMuYXhlc1szXVxuICAgICAgfTsgICAgICBcbiAgICB9LFxuICAgIGdldCBsZWZ0U3RpY2soKXtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHg6IHRoaXMuYXhlc1swXSxcbiAgICAgICAgeTogdGhpcy5heGVzWzFdXG4gICAgICB9O1xuICAgIH1cbiAgfTtcblxuICBtb2R1bGUuZXhwb3J0cyA9IFBhZDtcblxufSkoKTtcbiIsIihmdW5jdGlvbigpe1xuICB2YXIgVGFua1ZpZXcgPSBmdW5jdGlvbigpe1xuICAgIHRoaXMuaW5pdGlhbGl6ZS5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuICB9O1xuXG4gIFRhbmtWaWV3LnByb3RvdHlwZSA9e1xuICAgIGluaXRpYWxpemU6IGZ1bmN0aW9uKHBhZCwgbGVmdCwgcmlnaHQpe1xuICAgICAgdGhpcy5fcGFkID0gcGFkO1xuICAgICAgdGhpcy5fbGVmdCA9IGxlZnQ7XG4gICAgICB0aGlzLl9yaWdodCA9IHJpZ2h0O1xuICAgIH0sXG4gICAgc3RhcnQ6IGZ1bmN0aW9uKCl7XG4gICAgICB0aGlzLnN0b3BwaW5nID0gZmFsc2U7XG4gICAgICB0aGlzLnVwZGF0ZSgpO1xuICAgIH0sXG4gICAgc3RvcDogZnVuY3Rpb24oKXtcbiAgICAgIHRoaXMuc3RvcHBpbmcgPSB0cnVlO1xuICAgIH0sXG4gICAgdXBkYXRlOiBmdW5jdGlvbigpe1xuICAgICAgdGhpcy5sZWZ0LnRleHRDb250ZW50ID0gdGhpcy5wYWQubGVmdFN0aWNrLnk7XG4gICAgICB0aGlzLnJpZ2h0LnRleHRDb250ZW50ID0gdGhpcy5wYWQucmlnaHRTdGljay55O1xuICAgICAgaWYoIXRoaXMuc3RvcHBpbmcpe1xuICAgICAgICB3aW5kb3cucmVxdWVzdEFuaW1hdGlvbkZyYW1lKCgpID0+IHtcbiAgICAgICAgICB0aGlzLnVwZGF0ZSgpO1xuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9LFxuICAgIGdldCBwYWQoKXtcbiAgICAgIHJldHVybiB0aGlzLl9wYWQ7XG4gICAgfSxcbiAgICBnZXQgbGVmdCgpe1xuICAgICAgcmV0dXJuIHRoaXMuX2xlZnQ7XG4gICAgfSxcbiAgICBnZXQgcmlnaHQoKXtcbiAgICAgIHJldHVybiB0aGlzLl9yaWdodDtcbiAgICB9ICAgIFxuICB9O1xuXG4gIG1vZHVsZS5leHBvcnRzID0gVGFua1ZpZXc7XG59KSgpO1xuIl19
