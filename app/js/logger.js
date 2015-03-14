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
