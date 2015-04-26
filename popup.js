var tabid,winid;
var nbsp='\u00A0';

// tab index is supported by href=# so be sure to ev.preventDefault()

function popupimage(mylink, windowname)
{
	var w=Math.round(window.outerWidth*1.114),h=Math.round(window.outerHeight*1.15);
	chrome.windows.create({url:mylink.href,width:w,height:h,focused:false,type:"panel"},function(win){});
	return false;
}

function popOut(){
	popupimage({href:chrome.extension.getURL('popup.html')+'#'+winid},"ColorPick");
	ev.preventDefault();
}

function doEncodeURIComponent(s){
	return s; //optional encodeURIComponent(s);
}

function doDecodeURIComponent(s){
	return decodeURIComponent(s);
}

function navigate(ev){
	var oUrl='',i,l;
	if( document.getElementById('uri') ){
		oUrl+=document.getElementById('uri').value;
	}else{
		var uriParts = [];
		var uriPieces=document.querySelectorAll('input.uricomponent');
		for( i=0,l=uriPieces.length;i<l;i++ ){
			uriParts.push(uriPieces[i].value);
		}
		oUrl+=uriParts.join('/');
	}

	var keys=document.querySelectorAll('input.key');
	var vals=document.querySelectorAll('input.val');
	var kvps=[], hash;

	for( i=0,l=keys.length;i<l;i++ )
		if(vals[i] && keys[i].value)
			kvps.push(keys[i].value+'='+doEncodeURIComponent(vals[i].value));

	if(kvps.length){
		oUrl+='?'+kvps.join('&');
	}

	hash = document.getElementById('hash');

	if(hash && hash.value){
		oUrl+='#'+document.getElementById('hash').value;
	}

	console.log(oUrl);
	chrome.tabs.update(tabid,{url:oUrl,active:true});
}

function revealTab(ev){
	chrome.tabs.update(tabid,{active:true});
	chrome.windows.update(winid,{focused:true}); // drawAttention:true
	chrome.windows.getCurrent({}, function(window){
		chrome.windows.update(window.id,{focused:true});
	});
	ev.preventDefault();
}

function row(qDelim,key,val){
	return  [
		Cr.elm('label',{},[
			Cr.elm('span',{title:'Query Key'},[Cr.txt(qDelim)]),
			Cr.elm('input',{class:'key',value:doDecodeURIComponent(key)})
		]),
		Cr.elm('label',{},[
			Cr.elm('span',{title:'Query Value'},[Cr.txt('=')]),
			Cr.elm('input',{class:'val',value:doDecodeURIComponent(val)})
		]),
		Cr.elm('a',{class:'link',title:'Remove Parameter',events:['click',removeRow]},[Cr.txt('-')])
	];
}

function addRow(ev){
	Cr.elm('div',{class:'qrow'},row(document.getElementById('query_area').childNodes.length ? '&':'?','',''),document.getElementById('query_area'));
	ev.preventDefault();
}

function removeRow(ev){
	ev.target.parentNode.parentNode.removeChild(ev.target.parentNode);
	ev.preventDefault();
}

function removeUricomponent(ev){
	ev.target.parentNode.parentNode.removeChild(ev.target.parentNode);
	ev.preventDefault();
}

function expandUrl(ev){
	var dest = ev.target.parentNode.parentNode;
	var label = ev.target.parentNode;
	var url = label.querySelector('input').value;
	label.parentNode.removeChild(label);

	var fragment = document.createDocumentFragment();
	var delim = '';
	var urls = url.split("/");
	for( var i=0,l=urls.length; i<l; i++ ){
		if( !urls[i] ){
			fragment.appendChild(Cr.elm('span',{title:'Url Path'},[Cr.txt(delim)]));
			fragment.appendChild(Cr.elm('input',{class:'uricomponent',style:!urls[i]?'display:none;':'',value:doDecodeURIComponent(urls[i])}));
			continue;
		}
		fragment.appendChild(Cr.elm('span',{},[Cr.elm('label',{},[
			Cr.elm('span',{title:'Url Path'},[Cr.txt(delim)]),
			Cr.elm('input',{class:'uricomponent',style:!urls[i]?'display:none;':'',value:doDecodeURIComponent(urls[i])}),
			Cr.elm('a',{class:'link',title:'Remove',events:['click',removeUricomponent],href:'#'},[Cr.txt('-')]),
			Cr.elm('br')
		])]));
		delim = '/';
	}
	dest.insertBefore(Cr.elm('div',{class:'wrap'},[fragment]), dest.firstChild);
	ev.preventDefault();
}

function mouseOverElms(ev){
	// if( ev.target.nodeName == "INPUT" ){
	// 	ev.target.select();
	// }
}
function clickElms(ev){
	if( ev.target.nodeName == "SPAN" ){
		ev.target.nextSibling.select();
	}
}
function init(url){
	var queryParts,qKeyVal,qKeyValElms=[],hashElms=[],hash,qDelim='?',i,l;

	var parts = url.split('#');
	hash = parts[1] || '';
	parts = parts[0].split('?');


	var url = parts[0];
	var query = parts[1];
	
	if( query ){

		queryParts = query.split('&');
		for( i=0,l=queryParts.length;i<l;i++ ){
			qKeyVal = queryParts[i].split('=');
			qKeyValElms.push(
				Cr.elm('div',{class:'qrow'},row(qDelim,qKeyVal[0],qKeyVal[1]))
			);
			qDelim='&';
		}
	}

	hashElms.push(
		Cr.elm('label',{},[
			Cr.elm('span',{title:'Location Hash'},[Cr.txt('#')]),
			Cr.elm('input',{id:'hash',value:doDecodeURIComponent(hash)})
		])
	);

	Cr.elm('div',{events:[['mouseover',mouseOverElms],['click',clickElms]]},[
		Cr.elm('label',{},[
			Cr.elm('span',{title:'Url Path'},[Cr.txt(nbsp)]),
			Cr.elm('input',{id:'uri',value:doDecodeURIComponent(url)}),
			Cr.elm('a',{class:'link',title:'Expand URL Pieces',events:['click',expandUrl]},[Cr.txt('+')])
		]),
		Cr.elm('div',{id:'query_area'},qKeyValElms),
		Cr.elm('div',{id:'qctrl'},[Cr.elm('a',{events:['click',addRow],title:'Add Query Param',class:'reveal link',href:'#'},[Cr.txt('+query')])]),
		Cr.elm('div',{id:'hash_area'},hashElms),
		Cr.txt(nbsp),
		!popoutMode?
			Cr.elm('input',{title:'Seperate window',type:'button',class:'pop',value:'Popout',events:['click',popOut]})
			:
			Cr.elm('a',{events:['click',revealTab],class:'reveal link',href:'#'},[Cr.txt('Reveal Tab')]),
		Cr.elm('input',{type:'button',class:'go',value:'Get',events:['click',navigate]})
	],document.body);
}


var popoutMode=false;
document.addEventListener('DOMContentLoaded', function () {
	var q={active:true}

	if(window.location.hash){
		q.windowId=window.location.hash.replace('#','')-0;
		popoutMode=true;
	}else{
		q.currentWindow=true;
	}

	chrome.tabs.query(q, function(tabs){
		tabid=tabs[0].id;
		winid=tabs[0].windowId;
		init(tabs[0].url);
	});
});
