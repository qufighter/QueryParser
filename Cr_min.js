// Cr.elm [create element] by Sam Larison -- Sam @ Vidsbee.com -- Cr.js
// https://github.com/qufighter/Cr
var Cr = {
	doc : typeof document != 'undefined' ? document : null,
	elm : function(nodeType,attributes,addchilds,appnedTo){
		var ne=this.doc.createElement(nodeType),i,l,lev;
		if(attributes){
			if( lev=(attributes.event || attributes.events) ){
				if(typeof(lev[0])=='string') ne.addEventListener(lev[0],lev[1],lev[2]);
				else if(lev.length)
					for(i=0,l=lev.length;i<l;i++)
						ne.addEventListener(lev[i][0],lev[i][1],lev[i][2]);
			}
			if( attributes.childNodes ){
				if(appnedTo || (addchilds && addchilds.length)){
					console.warn("Cr Exception: if providing attributes.childNodes; 3 args max, addchilds argument becomes final argument appnedTo");
					if( addchilds.length ){
						attributes.childNodes = attributes.childNodes.concat(addchilds);
						addchilds = appnedTo;
					}
				}
				appnedTo = addchilds;
				addchilds = attributes.childNodes;
			}
			for( i in attributes ){
				if( i.substring(0,5) == 'event' || i == 'childNodes' ){
					//handled earlier
				}else if( i == 'checked' || i == 'selected'){
					if(attributes[i])ne.setAttribute(i,i);
				}else ne.setAttribute(i,attributes[i]);
			}
		}
		if(addchilds){
			for( i=0,l=addchilds.length;i<l;i++ ){
				if(addchilds[i])ne.appendChild(addchilds[i]);//you probably forgot a comma when calling the function
			}
		}
		if(appnedTo){
			this.insertNode(ne, appnedTo);
		}
		return ne;//identifier unexpected error pointing here means you're missing a comma on the row before inside an array of nodes addchilds
	},
	/*Cr.txt creates text nodes, does not support HTML entiteis */
	txt : function(textContent){
		return this.doc.createTextNode(textContent);
	},
	/*Cr.ent creates text nodes that may or may not contain HTML entities.  From a
	single entity to many entities interspersed with text are all supported by this */
	ent : function(textContent){
		return this.doc.createTextNode(this.unescapeHtml(textContent));
	},
	/*Cr.frag creates a document fragment */
	frag: function(nodes){
		var f = this.doc.createDocumentFragment();
		if(nodes) this.insertNodes(nodes, f);
		return f;
	},
	/*Cr.events creates event arrays, or just use array literals */
	evt : function(eventType,callback,useCapture){ return Array.prototype.slice.call(arguments); },
	evts: null,// (evt0, evt1, evtN...)
	event: null,
	events: null,
	/*Cr.paragraphs creates an array of nodes that may or may not contain HTML entities.*/
	paragraphs : function(textContent){
		var textPieces=textContent.split("\n");
		var elmArray=[];
		for(var i=0,l=textPieces.length;i<l;i++){
			elmArray.push(Cr.elm('p',{},[Cr.ent(textPieces[i])]));
		}
		return elmArray;
	},
	insertNode : function(newNode, parentElem, optionalInsertBefore){
		if(!parentElem)parentElem=this.doc.body;
		if(optionalInsertBefore && optionalInsertBefore.parentNode == parentElem){
			parentElem.insertBefore(newNode,optionalInsertBefore);
		}else{
			parentElem.appendChild(newNode);
		}
	},
	insertNodes : function(newNodes, parentElem, optionalInsertBefore){
		if(newNodes.nodeType)
			this.insertNode(newNodes, parentElem, optionalInsertBefore);
		else{
			for(var i=0,l=newNodes.length;i<l;i++){
				this.insertNode(newNodes[i], parentElem, optionalInsertBefore);
			}
		}
	},
	empty : function(node){
		while(node.lastChild)node.removeChild(node.lastChild);
	},
	unescapeHtml : function(str) { //trick used to make HTMLentiites work inside textNodes
		if(str.length < 1)return str;
		var temp = this.doc.createElement("div");
		str = str.replace(/<\/?\w(?:[^"'>]|"[^"]*"|'[^']*')*>/gmi, '');
		temp.innerHTML = str;
		var result = temp.childNodes[0].nodeValue;
		this.empty(temp);
		return result;
	}
};

Cr.evts = Cr.evt,
Cr.event = Cr.evt,
Cr.events = Cr.evt;
