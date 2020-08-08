var tabid=null,winid=null;
var nbsp='\u00A0';
var xcellController=null;
var iqsDelim='?';

// tab index is supported by href=# so be sure to ev.preventDefault() (test in popup!!!!)

function popupimage(mylink, windowname)
{
	var w=Math.round(window.outerWidth*1.15),h=Math.round(window.outerHeight*1.25);
	chrome.windows.create({url:mylink.href,width:w,height:h,focused:false,type:"panel"},function(win){});
	return false;
}

function popOutHash(){
	return '#'+winid+'-'+tabid;
}

function popOut(){
	popupimage({href:chrome.extension.getURL('popup.html')+popOutHash()},"Search API Query String Parser : Chrome Extension");
	ev.preventDefault();
}

function doEncodeURIComponent(s){
	if( document.getElementById('encodeComponents').checked ){
		return encodeURIComponent(s);
	}else if(s.indexOf('&') > -1){
		return encodeURIComponent(s);
	}
	return s;
}

function doDecodeURIComponent(s){
	try{
		return decodeURIComponent(s);
	}catch(e){}
	return unescape(s);
}

//go button
function navigate(ev, newWindow){
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

	//console.log(oUrl);
	if( newWindow || !tabid ){
		chrome.tabs.create({url:oUrl,active:true}, function(newTab){
			if( !tabid ){
				extractDetailsFromNewTab(newTab);
			}
		});
	}else{
		chrome.tabs.update(tabid,{url:oUrl,active:true}, function(tab){
			if(!tab || chrome.runtime.lastError ){
				// our orig tab is closed, create a new one!
				chrome.tabs.create({url:oUrl,active:true}, function(newTab){
					extractDetailsFromNewTab(newTab);
				});
			}
		});
	}
}

function extractDetailsFromNewTab(newTab){
	tabid = newTab.id;
	winid = newTab.windowId;
	underlyingTabChanged();
}

function possiblyNavigate(ev){
	if( ev.which == 2 ){ // middle mouse
		ev.preventDefault();
		navigate(ev, true);
	}
}

function revealTab(ev){
	chrome.tabs.update(tabid,{active:true}, function(t){
		if( !t || chrome.runtime.lastError ){
			console.warn('the origional tab was closed!  click `Get` to open a new tab.');
		}else if( winid ){
			chrome.windows.update(winid,{focused:true}); // drawAttention:true
			chrome.windows.getCurrent({}, function(window){
				chrome.windows.update(window.id,{focused:true});
			});
		}
	});
	ev.preventDefault();
}

function rebuildFromTab(ev){
	chrome.tabs.get(tabid, function(tab){
		resetAll();
		init(tab.url);
	});

	ev.preventDefault();
}

function row(qDelim,key,val){
	return  [
		Cr.elm('label',{class:'qmode xcellcell'},[
			Cr.elm('span',{title:'Query Key'},[Cr.txt(qDelim)]),
			Cr.elm('input',{type:'hidden',class:'qmode xcellinput',value:qDelim})
		]),
		Cr.elm('label',{class:'key xcellcell qsxcellcell'},[
			Cr.elm('input',{class:'key xcellinput qsxcellinput',value:doDecodeURIComponent(key),events:[['keyup',queryKeyChange],['change',queryKeyChange]]})
		]),
		Cr.elm('label',{class:'eq xcellcell'},[
			Cr.elm('span',{title:'Query Value'},[Cr.txt('=')]),
			Cr.elm('input',{type:'hidden',class:'eq xcellinput',value:(typeof(value)=='undefined')?'=':''})
		]),
		Cr.elm('label',{class:'value xcellcell qsxcellcell'},[
			Cr.elm('input',{class:'val xcellinput qsxcellinput',value:val?doDecodeURIComponent(val):'',events:[['keyup',queryValChange],['change',queryValChange]]})
		]),
		Cr.elm('a',{class:'link',title:'Remove Parameter',events:['click',removeRow]},[Cr.txt('-')])
	];
}

function updateKeyValueFromArr(key, val, arr){
	if( arr[1].indexOf('&') && arr.length > 2 ){
		var QS = arr.slice(1).join('=').split('&');
		arr[1] = QS.shift();
		document.getElementById('query_area').appendChild(Cr.frag(parseQuery(QS.join('&')).qsElmArr));
	}
	key.value = arr[0], val.value = arr[1];
	xcellRebuildIndex();
}

function queryKeyChange(ev){
	var key = ev.target;
	var val = key.parentNode.parentNode.querySelector('input.val');
	if( val.value === '' && key.value.indexOf('=') > 0 ){
		var parts = key.value.split('=');
		updateKeyValueFromArr(key, val, parts);
		val.select();
	}
}

function queryValChange(ev){
	var val = ev.target;
	var key = val.parentNode.parentNode.querySelector('input.key');
	if( key.value === '' ){
		var parts = val.value.split('=');
		if( parts.length > 1 && parts[1].length > 0 ){
			updateKeyValueFromArr(key, val, parts);
		}
	}
	var equiv = val.parentNode.parentNode.querySelector('input.eq');
	if( val.value ){ equiv.value = '='; }
}

function addRow(ev){
	Cr.elm('div',{class:'qrow'},row(document.getElementById('query_area').childNodes.length ? '&':'?','',''),document.getElementById('query_area'));
	ev.preventDefault();
	xcellRebuildIndex();
}

function sortQueries(ev){
	var qa=document.getElementById('query_area');
	var arr = Array.prototype.slice.call(qa.querySelectorAll('.qrow'), 0);
	arr.sort(function(a, b){
		return a.querySelector('input.key').value.localeCompare(b.querySelector('input.key').value);
	});
	var concatenator = '?';
	for( var x=0,l=arr.length; x<l; x++ ){
		var mode = arr[x].querySelector('label.qmode');
		mode.querySelector('span').innerText=concatenator;
		mode.querySelector('input.qmode').value=concatenator;
		qa.appendChild(arr[x]);
		concatenator='&';
	}
	ev.preventDefault();
	xcellRebuildIndex();
}

function removeRow(ev){
	ev.target.parentNode.parentNode.removeChild(ev.target.parentNode);
	ev.preventDefault();
	xcellRebuildIndex();
	ensureFirstQueryRowDelimiterValid();
}

function ensureFirstQueryRowDelimiterValid(){
	var rows=document.getElementById('query_area').childNodes;
	if( rows.length ){
		rows[0].querySelector('.qmode span').innerText = '?';
		rows[0].querySelector('.qmode input.qmode').value = '?';
	}
}

function removeUricomponent(ev){
	ev.target.parentNode.parentNode.removeChild(ev.target.parentNode);
	ev.preventDefault();
	xcellRebuildIndex();
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
		fragment.appendChild(
			Cr.elm('label',{class:'xcellcell'},[
				Cr.elm('span',{title:'Url Path'},[Cr.txt(delim)]),
				Cr.elm('input',{type:'hidden',class:'xcellinput',value:delim})
			])
		);
		if( !urls[i] ){
			fragment.appendChild(
				Cr.elm('label',{class:'xcellcell'},[
					//Cr.elm('span',{title:'Url Path'},[Cr.txt(delim)]),
					Cr.elm('input',{class:'uricomponent xcellinput',style:!urls[i]?'display:none;':'',value:(urls[i])})
				])
			);
			continue;
		}
		fragment.appendChild(Cr.elm('span',{},[Cr.elm('label',{class:'xcellcell'},[
			//Cr.elm('span',{title:'Url Path'},[Cr.txt(delim)]),
			Cr.elm('input',{class:'uricomponent xcellinput',style:!urls[i]?'display:none;':'',value:doDecodeURIComponent(urls[i])}),
			Cr.elm('a',{class:'link',title:'Remove',events:['click',removeUricomponent],href:'#'},[Cr.txt('-')]),
			Cr.elm('br')
		])]));
		delim = '/';
	}
	dest.insertBefore(Cr.elm('div',{class:'wrap'},[fragment]), dest.firstChild);
	ev.preventDefault();
	xcellRebuildIndex();
}

function dragOverElms(ev){
	if( ev.target.type=="button" ){
		addRow(ev);
	}
}
function mouseOverElms(ev){
	// if( ev.target.nodeName == "INPUT" ){
	// 	ev.target.select();
	// }
}
function clickElms(ev){
	// I think the intention here, is clickign the label will select the coresponding field... 
	// if( ev.target.nodeName == "SPAN" ){
	// 	ev.target.nextSibling.select();
	// }
}

function parseQuery(query){
	var retKvps = [], qKeyValElms=[], qKeyVal;
	var queryParts = query.split('&');
	for( i=0,l=queryParts.length;i<l;i++ ){
		qKeyVal = queryParts[i].split('=');
		if( qKeyVal.length > 2 ){
			qKeyVal[1] = qKeyVal.slice(1).join('='); // "=" is allowed anywhere in a query value
		}
		qKeyValElms.push(
			Cr.elm('div',{class:'qrow'},row(iqsDelim,qKeyVal[0],qKeyVal[1]))
		);
		retKvps.push(qKeyVal);
		iqsDelim='&';
	}
	return {qsArr:retKvps, qsElmArr: qKeyValElms};
}

function resetAll(){
	iqsDelim='?';
	Cr.empty(document.getElementById('content'));
}

function init(url){
	var qKeyValElms=null,hashElms=[],hash,i,l;

	var parts = url.split('#');
	hash = parts[1] ? parts.slice(1).join('#') : ''; // "#" seems allowable in the hash part
	parts = parts[0].split('?');
	if( parts.length > 2 ){
		parts[1] = parts.slice(1).join('?'); // "?" is allowed anywhere in the query part (name or value)
	}

	url = parts[0];
	var query = parts[1];
	
	if( query ){
		qKeyValElms = parseQuery(query).qsElmArr;
	}

	hashElms.push(
		Cr.elm('label',{class:'xcellcell'},[
			Cr.elm('input',{type:'hidden',class:'xcellinput',value:'#'})
		])
	);
	hashElms.push(
		Cr.elm('label',{class:'xcellcell'},[
			Cr.elm('span',{title:'Fragment'},[Cr.txt('#')]),
			Cr.elm('input',{id:'hash',class:'xcellinput',value:doDecodeURIComponent(hash)})
		])
	);

	var outerDiv = Cr.elm('div',{class:"sheet",events:[['mouseover',mouseOverElms],['click',clickElms]]},[
		Cr.elm('div',{class:'allrows'},[
			Cr.elm('label',{class:'xcellcell'},[
				Cr.elm('span',{title:'Url Path'},[Cr.txt(nbsp)]),
				Cr.elm('input',{id:'uri',class:'xcellinput',value:doDecodeURIComponent(url)}),
				Cr.elm('a',{class:'link',title:'Expand URL Pieces',events:['click',expandUrl]},[Cr.txt('\u224D')])
			]),
			Cr.elm('div',{id:'query_area'},qKeyValElms),
			Cr.elm('div',{id:'qctrl'},[
				Cr.elm('a',{events:[['click',addRow]],dragable:true,title:'Add Query Param',class:'rfloat link',href:'#'},[Cr.txt('+Query')]),
				Cr.elm('a',{events:[['click',sortQueries]],dragable:false,title:'Sort Query Params',class:'rfloat link',href:'#'},[Cr.txt('Abc')]),
				Cr.elm('span',{id:'xcellcontrols'},[
					Cr.elm('a',{events:['click',xcellSelectAllConsecutiveMode],title:'Select consecutive cells (not only query parameters, includes connective ?,&,=,/,#)',class:'rfloat link',href:'#'},[Cr.elm('span',{class:'rotate90'},[Cr.txt('\u229F')])]),
					Cr.elm('a',{events:['click',xcellMode],title:'Xcellify query parameters to select, copy and paste several tab & newline delimited query parameters into a spreadsheet,\nor to select one column only.',class:'rfloat link',href:'#'},[Cr.elm('span',{class:'rotate90'},[Cr.txt('\u229E')])])
				]),
				Cr.elm('a',{id:'donexcell',events:['click',doneXcell],title:'Return to normal mode',class:'rfloat link hidden',href:'#'},[Cr.txt('\u2713')])
			]),
			Cr.elm('div',{id:'hash_area'},hashElms),
			Cr.txt(nbsp),
			!popoutMode?
				Cr.elm('input',{title:'Seperate window',type:'button',class:'pop',value:'Popout',events:['click',popOut]})
				:
				Cr.frag([
					Cr.elm('input',{title:'Clear all fields and re-create with the current tab URL',type:'button',class:'pop',value:'Grab Tab Url',events:['click',rebuildFromTab]}),
					Cr.elm('a',{events:['click',revealTab],class:'rfloat link',href:'#'},[Cr.txt('Reveal Tab')]),
				]),
			Cr.elm('input',{type:'button',class:'go',title:'Go http GET, like press return at the URL bar.',value:'Get',events:[['click',navigate],['mouseup',possiblyNavigate],['dragover',dragOverElms]]}),
			Cr.elm('label',{title:'Encode Query Values',class:'go'},[
				Cr.elm('input',{type:'checkbox',id:'encodeComponents'})
			])
		])
	],document.getElementById('content'));
	document.getElementById('cvs').height=1;

	underlyingTabChanged();
}

function underlyingTabChanged(){
	if( popoutMode && tabid && winid ){
		window.location.hash=popOutHash();
		document.querySelectorAll('a[href^="#"]').forEach(function(e){
			e.href = popOutHash();
		});
	}
}

function doneXcell(ev){
	xcellController.destroy();
	xcellController = null;
	toggleXcellmodeBtnsOff();
	ev.preventDefault();
}

function xcellRebuildIndex(){
	if(xcellController) xcellController.rebuildIndex();
}

function xcellSelectAllConsecutiveMode(ev){
	ev.preventDefault();
	if( xcellController ) return doneXcell(); // should be impossible to reach here
	xcellController = new Xcellify({
		containerElm: document.querySelector('.sheet'),
		cellSelector: '.xcellcell',
		rowSelector: '.allrows',
		cellInputClassName: 'xcellinput',
		headingClassName: 'xcellheading',
		skipInvisibleCells: false,
		delimitCells: "",
		delimitRows: "",
		tabReplacement:false,
		quoteValue: function(v){return v},
		selectionConfirmation: function(selSize,clipSize,cbf){cbf();}
	});
	toggleXcellmodeBtnsOn();
}

function xcellMode(ev){
	ev.preventDefault();
	if( xcellController ) return doneXcell(); // should be impossible to reach here
	xcellController = new Xcellify({
		containerElm: document.querySelector('#query_area'),
		cellSelector: '.qsxcellcell',
		rowSelector: '.qrow',
		cellInputClassName: 'qsxcellinput',
		headingClassName: 'xcellheading',
		selectionConfirmation: function(selSize,clipSize,cbf){cbf();}
	});
	toggleXcellmodeBtnsOn();
}

function toggleXcellmodeBtnsOn(){
	document.getElementById('xcellcontrols').style.display='none';
	document.getElementById('donexcell').style.display='inline';
}

function toggleXcellmodeBtnsOff(){
	document.getElementById('xcellcontrols').style.display='inline';
	document.getElementById('donexcell').style.display='none';
}

var popoutMode=false;

function tabGottenCb(tab){
	tabsGottenCb([tab])
}

function tabsGottenCb(tabs){
	if( tabs[0] ){
		tabid=tabs[0].id;
		winid=tabs[0].windowId;
	}
	init(tabs[0] ? tabs[0].url : 'about:blank');
}

document.addEventListener('DOMContentLoaded', function () {

	var q={active:true};

	if(window.location.hash){
		var hashRaw = window.location.hash.replace('#','');
		var hashPar = hashRaw.split('-');
		q.windowId=hashPar[0]-0;
		if( hashPar[1] ){
			q.tabId=hashPar[1]-0;
		}
		popoutMode=true;
	}else{
		q.currentWindow=true;
	}

	document.addEventListener('keyup', function(ev){
		if( ev.keyCode == 13) navigate(ev);
	});

	if( q.tabId ){
		chrome.tabs.get(q.tabId, tabGottenCb);
	}else{
		chrome.tabs.query(q, tabsGottenCb);
	}
});
