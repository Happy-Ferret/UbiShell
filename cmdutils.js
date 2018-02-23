// CmdUtils
// jshint esversion: 6 

if (!CmdUtils) var CmdUtils = { 
    VERSION: chrome.runtime.getManifest().version,
    DEBUG: false,
    CommandList: [],
    jQuery: jQuery,
    backgroundWindow: window,
    popupWindow: null,
    log: console.log,
    active_tab: null,   // tab that is currently active, updated via background.js 
    selectedText: "",   // currently selected text, update via content script selection.js
    selectedHTML: "",   // currently selected text, update via content script selection.js
    setPreview: function setPreview(message, prepend) { console.log(message); },
    setResult: function setResult(message, prepend) { console.log(message); },
};

// debug log
CmdUtils.deblog = function () {
    if(CmdUtils.DEBUG){
        console.log.apply(console, arguments);
    }
}

// creates command and adds it to command array, name or names must be provided and preview execute functions
CmdUtils.CreateCommand = function CreateCommand(args) {
    args.name = args.name || args.names[0];
    args.names = args.names || [args.name];
    if (CmdUtils.getcmd(args.name)) {
        // remove previously defined command with this name
        CmdUtils.CommandList = CmdUtils.CommandList.filter( cmd => cmd.name !== args.name );
    }
    //console.log("command created ", args.name);
    var to = parseFloat(args.timeout || 0);
    if (to>0) {
    	args.timeoutFunc = null;
    	if (typeof args.preview == 'function') {
		    args.preview_timeout = args.preview;
			args.preview = function(b,a) {
                if (args.preview_timeoutFunc !== null) clearTimeout(args.preview_timeoutFunc);
                args.preview_timeoutFunc = setTimeout(function () { 
                	args.preview_timeout(b, a); 
                }, to);
			};
    	}
    	if (typeof args.execute == 'function') {
		    args.execute_timeout = args.execute;
			args.execute = function(a) {
                if (args.execute_timeoutFunc !== null) clearTimeout(args.execute_timeoutFunc);
                args.execute_timeoutFunc = setTimeout(function () {
					args.execute_timeout(a);
                }, to);
			};
    	}
    }
    CmdUtils.CommandList.push(args);
};

// closes current tab
CmdUtils.closeTab = function closeTab() {
	chrome.tabs.query({active:true,currentWindow:true},function(tabs){
        if (tabs && tabs[0]) 
            chrome.tabs.remove(tabs[0].id, function() { });
        else 
            console.error("closeTab failed because 'tabs' is not set");
	});
};

// returns active tabs URL if avaiable
CmdUtils.getLocation = function getLocation() {
    if (CmdUtils.active_tab && CmdUtils.active_tab.url) 
        return CmdUtils.active_tab.url;
    else 
        return ""; 
};

// opens new tab with provided url
CmdUtils.addTab = function addTab(url) {
	if (typeof browser !== 'undefined') {
		browser.tabs.create({ "url": url });
	} else 
	if (typeof chrome !== 'undefined' && typeof chrome.tabs !== 'undefined') {
		chrome.tabs.create({ "url": url });
	} else {
		window.open(url);
	}
};

// opens new tab with post request and provided data
CmdUtils.postNewTab
 = function postNewTab(url, data) {
	var form = document.createElement("form");
	form.setAttribute("method", "post");
	form.setAttribute("action", url);
	form.setAttribute("target", "_blank");

	if (typeof data === 'string') data = Utils.urlToParams(data);
	for (var i in data) {
		if (data.hasOwnProperty(i)) {
			var input = document.createElement('input');
			input.type = 'hidden';
			input.name = i;
			input.value = data[i];
			form.appendChild(input);
		}
	}

	document.body.appendChild(form);
	form.submit();
	document.body.removeChild(form);
}

// returns a function that opens new tab with substituted {text} and {location} 
CmdUtils.SimpleUrlBasedCommand = function SimpleUrlBasedCommand(url) {
    if (!url) return;
    var search_func = function(directObj) {
        if (!directObj) return;
        var text = directObj.text;
        text = encodeURIComponent(text);
        var finalurl = url;
        finalurl = finalurl.replace('{text}', text);
        finalurl = finalurl.replace('{location}', CmdUtils.getLocation());
        CmdUtils.addTab(finalurl);
    };
    return search_func;
};

// closes ubiquity popup
CmdUtils.closePopup = function closePopup(w) {
    if (typeof popupWindow !== "undefined") popupWindow.close();
};

// gets json with xhr
CmdUtils.ajaxGetJSON = function ajaxGetJSON(url, callback) {
    var xhr = new XMLHttpRequest();
    xhr.open("GET", url, true);
    xhr.onreadystatechange = function() {
        if (xhr.readyState == 4) {
            var resp = JSON.parse(xhr.responseText);
            callback(resp, xhr);
        }
    };
    xhr.send();
};

// gets page with xhr
CmdUtils.ajaxGet = function ajaxGet(url, callback) {
    var xhr = new XMLHttpRequest();
    xhr.open("GET", url, true);
    xhr.onreadystatechange = function() {
        if (xhr.readyState == 4) {
            callback(xhr.responseText, xhr);
        }
    };
    xhr.send();
};

// performs jQuery get and returns jqXHR that implements Promise 
CmdUtils.get = function get(url) {
	return jQuery.ajax({
    	url: url,
        async: true
	});
};

// performs jQuery post and return jsXHR
CmdUtils.post = function post(url, data) {
	return jQuery.ajax({
    	url: url,
    	data: data,
        async: true
	});
};

// loads remote scripts into specified window (or backround if not specified)
CmdUtils.loadScripts = function loadScripts(url, callback, wnd=window) {
    // this array will hold all loaded scripts into this window
    wnd.loadedScripts = wnd.loadedScripts || [];
	url = url || [];
	if (url.constructor === String) url = [url];

    if (typeof wnd.jQuery === "undefined") {
        console.error("there's no jQuery at "+wnd+".");
        return false;
    }
	if (url.length == 0) 
		return callback();

	var thisurl = url.shift();
	tempfunc = function(data, textStatus, jqXHR) {
		return loadScripts(url, callback, wnd);
	};
	if (wnd.loadedScripts.indexOf(thisurl)==-1) {
		console.log("loading :::: ", thisurl);
		wnd.loadedScripts.push(thisurl);
    	wnd.jQuery.ajax({
            url: thisurl,
            dataType: 'script',
            success: tempfunc,
            async: true
        });
    }
    else {
    	tempfunc();
    }
};

// updates selectedText variable
CmdUtils.updateSelection = function (tab_id) {
    chrome.tabs.executeScript( tab_id, { code: "window ? window.getSelection().toString() : '';" }, function(selection) {
        if (selection && selection.length>0) CmdUtils.selectedText = selection[0] || "";
        CmdUtils.deblog("selectedText is ", CmdUtils.selectedText);  
    });
};

// called when tab is switched or changed, updates selectedText and activeTab
CmdUtils.updateActiveTab = function () {
    if (chrome.tabs && chrome.tabs.getSelected)
    chrome.tabs.getSelected(null, function(tab) {
        if (tab.url.match('^https?://')){
            CmdUtils.active_tab = tab;
            CmdUtils.updateSelection(tab.id);
        }
    });
};

// replaces current selection with string provided
CmdUtils.setSelection = function setSelection(s) {
    console.log("CmdUtils.setSelection"+s)
    if (typeof s!=='string') s = s+'';
    s = s.replace(/(['"])/g, "\\$1");
    // http://jsfiddle.net/b3Fk5/2/
    var insertCode = `
    function replaceSelectedText(replacementText) {
        var sel, range;
        if (window.getSelection) {
            sel = window.getSelection();
            var activeElement = document.activeElement;
            if (activeElement.nodeName == "TEXTAREA" ||
                (activeElement.nodeName == "INPUT" && activeElement.type.toLowerCase() == "text")) {
                    var val = activeElement.value, start = activeElement.selectionStart, end = activeElement.selectionEnd;
                    activeElement.value = val.slice(0, start) + replacementText + val.slice(end);
            } else {
                if (sel.rangeCount) {
                    range = sel.getRangeAt(0);
                    range.deleteContents();
                    range.insertNode(document.createTextNode(replacementText));
                } else {
                    sel.deleteFromDocument();
                }
            }
        } else if (document.selection && document.selection.createRange) {
            range = document.selection.createRange();
            range.text = replacementText;
        }
    }
    replaceSelectedText("`+s+`");`;
    if (CmdUtils.active_tab && CmdUtils.active_tab.id)
        return chrome.tabs.executeScript( CmdUtils.active_tab.id, { code: insertCode } );
    else 
        return chrome.tabs.executeScript( { code: insertCode } );
};

// for measuring time the input is changed
CmdUtils.inputUpdateTime = performance.now();
CmdUtils.timeSinceInputUpdate = function timeSinceInputUpdate() {
	return (performance.now() - CmdUtils.inputUpdateTime)*0.001;
};

// returns command with this name
CmdUtils.getcmd = function getcmd(cmdname) {
    for (var c in CmdUtils.CommandList) 
        if (CmdUtils.CommandList[c].name == cmdname || CmdUtils.CommandList[c].names.indexOf(cmdname)>-1) return CmdUtils.CommandList[c];
    return null;
};

// sets clipboard
CmdUtils.setClipboard = function setClipboard (t) {
    var input = document.createElement('textarea');
    document.body.appendChild(input);
    input.value = t;
    input.focus();
    input.select();
    document.execCommand('Copy');
    input.remove();
};

CmdUtils.unloadCustomScripts = function unloadCustomScripts() {
    CmdUtils.CommandList = CmdUtils.CommandList.filter((c)=>{
        return c['builtIn']==true;
    });
    
}

CmdUtils.loadCustomScripts = function loadCustomScripts() {
    CmdUtils.unloadCustomScripts();
    // mark built-int commands
    CmdUtils.CommandList.forEach((c)=>{c['builtIn']=true;});

    // load custom scripts
    chrome.storage.local.get('customscripts', function(result) {
    	try {
    		eval(result.customscripts || "");
    	} catch (e) {
    		console.error("custom scripts eval failed", e);
    	}
    });
};

// show browser notification with simple limiter 
CmdUtils.lastNotification = "";
CmdUtils.notify = function (message, title) {
    if (CmdUtils.lastNotification == title+"/"+message) return;
    chrome.notifications.create({
        "type": "basic",
        "iconUrl": chrome.extension.getURL("res/icon-128.png"),
        "title": title || "UbiChr",
        "message": message
    });
    CmdUtils.lastNotification = title+"/"+message;
};

(function ( $ ) {
    $.fn.blankify = function( url ) {
        console.log("tryeing to blnk",this.find("a"));
        return this.find("a").not('[href^="http"],[href^="//:"],[href^="mailto:"],[href^="#"]').each(function() {
            console.log("bln");
            $(this).attr("target", "_blank").attr('href', function(index, value) {
                if (value.substr(0,1) !== "/") value = "/"+value;
                return url + value;
            });
});
        };
}( jQuery ));

// https://stackoverflow.com/questions/8498592/extract-hostname-name-from-string
function url_domain(data) {
    var    a      = document.createElement('a');
           a.href = data;
    return a.hostname;
}

(function ( $ ) {
    $.fn.loadAbs = function( url, complete ) {
        var result = this;
        return this.load(url, function() {
            url = "http://"+url_domain( url );
            result.find("a")
                    .not('[href^="http"],[href^="//:"],[href^="mailto:"],[href^="#"]')
                    .attr("target", "_blank")
                    .attr('href', function(index, value) {
                if (typeof value === "undefined") return url;
                if (value.substr(0,1) !== "/") value = "/" + value;
                return url + value;
            });
            if (typeof complete === 'function') complete();
        });
    };
}( jQuery ));