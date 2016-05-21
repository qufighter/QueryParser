/*jshint expr:true*/
/*
 * Xcelify by Sam Larison
 * transform selection of input elements into Excel-like spreadsheet with undo functionality - Excellify!
 * features: spreadsheet copy, cut, paste, multi-select, undo, redo, clear multiple, enter key move to next cell in selection
*/
var Xcellify = function(startupOptions){
  this.containerElm = null; //reqd
  this.rowSelector = '.xcellrow';
  this.cellSelector = '.xcellcell'; // should only select cells with input fields inside, not headings
  this.cellInputClassName = 'cellinput'; // should be unique such that cellSelector does not contain this
  this.cellInputQuerySelector = 'AUTO'; // "AUTO" to enable auto compute from '.'+cellInputClassName
  this.selectionBorderStyle = '2px solid #1567F0';
  this.copiedSelectionBorderStyle = '2px dashed #1567F0';
  this.selectionBackgroundStyle = '#C5E0FF';
  this.copyAreaSelector = null; //to have div on page defined that contains <textarea> for copy and paste
  this.headingClassName = '';
  this.headingQuerySelector = 'AUTO';
  this.buttonBar = null;
  this.skipInvisibleCells = true;
  this.singleCellEditingMode = false;
  this.delimitCells = "\t";
  this.delimitRows = "\n";
  this.hasFocus = 0;

  this.resetState = function(){
    this.tableCellContainers = [];
    this.fullGrid = [];
    this.tableCells = [];
    this.activeCell = null;
    this.totalDimensions = {x: 0, y: 0};
    this.activeCellIndex = {x: 0, y: 0};
    this.isDragging = false;
    this.dragOrigin = {x: 0, y: 0}; // x = col, y = row
    this.selectionStart = {x: 0, y: 0};
    this.selectionEnd = {x: 0, y: 0};
    this.copySelectionStart = {x: 0, y: 0};
    this.copySelectionEnd = {x: 0, y: 0};
    this.curSelectionisCopySel = false;
  };

  this.resetState();

  var c,cl, r,rl, row, cell, cells, evcell, x,y,xl,yl; // private counter vars

  this.init = function(startupOptions){ // to be called once per page load for a given container element that will remain on the page
    this.autoProps(startupOptions);
    this.setupButtonBar();
    this.rebuildIndex();
    this.attachListeners(); // attaches event listeners to both the document and container element
    this.validate();
    this.historyUtils.applyStateFn = this.applyHistoryState.bind(this);
    this.historyUtils.storeStateFn = this.storeStateInHistory.bind(this);
    this.clipboardUtils.copyAreaSelector = this.copyAreaSelector;
  };

  this.destroy = function(){ // not needed as long as container element stays the same and remains in the DOM, in which case you may call rebuildIndex if the table changes
    this.hideCurrentSelection();
    this.detachListeners();
    this.resetState();
  };

  this.autoProps = function(){
    for( var k in startupOptions ){ this[k] = startupOptions[k]; }
    var auto = ['cellInputQuerySelector', 'headingQuerySelector'];
    for( c=0, x=0, cl=auto.length; c<cl; c++ ){
      var fromField = auto[c].replace(/QuerySelector$/, 'ClassName');
      if( this[auto[c]] == "AUTO" && this[fromField] ){
        this[auto[c]] = '.'+this[fromField];
      }else{
        this[auto[c]] = null;
      }
    }
  };

  this.validate = function(){
    if( this.cellInputClassName.indexOf('.') > -1 ){
      console.error('Xcellify:Validation:Failure : cellInputClassName '+this.cellInputClassName+' looks like a selector, should be a unique class name');
    }
    if( this.headingClassName.indexOf('.') > -1 ){
      console.error('Xcellify:Validation:Failure : headingClassName '+this.headingClassName+' looks like a selector, should be a unique class name');
    }
    if( this.cellSelector.indexOf(this.cellInputClassName) > -1 ){
      console.error('Xcellify:Validation:Failure : cellInputClassName '+this.cellInputClassName+' must not be found in cellSelector '+this.cellSelector);
    }
  };

  this.getGrid = function(){
    this.fullGrid = []; // without rows we can still build the index from cells using an offset position helper function
    var rows = this.containerElm.querySelectorAll(this.rowSelector);
    for( r=0, y=0, rl=rows.length; r<rl; r++ ){
      this.fullGrid[y] = [];
      cells = rows[r].querySelectorAll(this.cellSelector);
      for( c=0, x=0, cl=cells.length; c<cl; c++ ){
        cell = cells[c].querySelector(this.cellInputQuerySelector);
        if( cell ){
          this.fullGrid[y][x] = cell;
          x++;
        }
      }
      if( this.fullGrid[y].length ){
        y++;
      }
    }
    this.storeStateInHistory();
  };

  this.setupHeadings = function(){
    var rows = this.containerElm.querySelectorAll(this.rowSelector), rheading, cheadings;
    if( this.headingQuerySelector && rows[0] ){
      cheadings = rows[0].querySelectorAll(this.headingQuerySelector);
      for( c=0, x=0, cl=cheadings.length; c<cl; c++ ){
        if( this.skipInvisibleCells && !this.elementIsVisible(cheadings[c]) ) continue;
        cheadings[c].setAttribute('data-xcelify-col', x++); // setting attributes is probably teh slowest opperation
        cheadings[c].setAttribute('data-xcelify-row', '*');
      }
    }
    for( r=0, y=0, rl=rows.length; r<rl; r++ ){
      if( this.skipInvisibleCells && !this.elementIsVisible(rows[r]) ) continue;
      cells = rows[r].querySelectorAll(this.cellSelector);
      if( cells.length ){
        if( this.headingQuerySelector ){
          rheading = rows[r].querySelector(this.headingQuerySelector);
          if( !rheading ) continue;
          rheading.setAttribute('data-xcelify-col', '*');
          rheading.setAttribute('data-xcelify-row', y);
        }
        y++;
      }
    }
  };

  // call this function whenever the table dom has been modified in a way that there is now a new spreadsheet or new visibility of cells/rows, update all cell references.
  this.rebuildIndex = function(){
    //before rebuilding index we can try to clear previous selection, but only if there was a previous index
    if( this.tableCells[0] && this.tableCells[0].length ){
      this.hideCurrentSelection();
      this.hideCopySelection();
    }
    this.resetState();
    this.getGrid(); // if grid size changed we may need to zap history states we have since they might apply no longer
    this.setupHeadings();

    for( r=0, y=0, rl=this.fullGrid.length; r<rl; r++ ){
      this.tableCellContainers[y] = [], this.tableCells[y] = [];
      row = this.fullGrid[r].length ? (this.findMatchingParent(this.fullGrid[r][0], this.rowSelector)) : null;
      if( this.skipInvisibleCells && (!row || !this.elementIsVisible(row)) ) continue;
      cells = this.fullGrid[r];
      for( c=0, x=0, cl=cells.length; c<cl; c++ ){
        cell = cells[c];
        if( this.skipInvisibleCells && !this.elementIsVisible(cell) ) continue;
        this.tableCellContainers[y][x] = this.findMatchingParent(cell, this.cellSelector) || cell;
        this.tableCells[y][x] = cell;
        cell.setAttribute('data-xcelify-col', x++);
        cell.setAttribute('data-xcelify-row', y);
      }
      if( this.tableCellContainers[y].length ){
        y++;
      }
    }
    this.totalDimensions = {x: this.tableCells[0] ? this.tableCells[0].length-1 : 0, y: y-1};
  };

  this.setupButtonBar = function(){
    if( this.buttonBar ){
      this.historyUtils.buttonBarElements = {
        undo: this.buttonBar.querySelector('.undo'),
        redo: this.buttonBar.querySelector('.redo')
      };
      this.attachListener(this.buttonBar.querySelector('.undo'), 'click', this.historyUtils.undo.bind(this.historyUtils));
      this.attachListener(this.buttonBar.querySelector('.redo'), 'click', this.historyUtils.redo.bind(this.historyUtils));
    }
  };

  this.attachListeners = function(){ // do not call more than once
    this.attachListener(this.containerElm, 'mousedown', this.mouseDownContainer.bind(this));
    this.attachListener(this.containerElm, 'mouseup', this.mouseUpContainer.bind(this));
    this.attachListener(this.containerElm, 'mouseover', this.mouseMoveContainer.bind(this));
    this.attachListener(document, 'keydown', this.keyboardDnEvents.bind(this));
    this.attachListener(document, 'keyup', this.keyboardUpEvents.bind(this));
    this.attachListener(document, 'focus', this.determineIfFocused.bind(this), true);
  };

  this._attachedListeners = [];
  this.attachListener = function(element, evName, fn, cap){
    cap = cap || false;
    element.addEventListener(evName, fn, cap);
    this._attachedListeners.push([element, evName, fn, cap]);
  }

  this.detachListeners = function(){
    for( var l=0,li,ln=this._attachedListeners.length; l<ln; l++ ){
      li = this._attachedListeners[l];
      li[0].removeEventListener(li[1],li[2],li[3]);
    }
    this._attachedListeners = [];
  };

  this.determineIfFocused = function(ev){
    if( this.findMatchingParent(ev.target, this.rowSelector) ||
        this.findMatchingParent(ev.target, this.copyAreaSelector) ||
        (this.clipboardUtils.lastArea && ev.target == this.clipboardUtils.lastArea) ){
      this.hasFocus = 1;
    }else{
      this.hasFocus = 0;
    }
  };

  this.keyboardDnEvents = function(ev){
    if( !this.hasFocus || !this.elementIsVisible(this.containerElm) || this.totalDimensions.x < 0 || this.totalDimensions.y < 0 ) return;
    if( ev.metaKey || ev.ctrlKey ){ // command/control
      switch(ev.keyCode){
        case 67: // C key - Copy
          this.captureCellCopy(ev);
          return;
        case 86: // V key - Paste
          this.applyCellPaste();
          return;
        case 88: // X key - Cut
          this.captureCellCopy(ev);
          this.setValueMultiCell(this.selectionStart, this.selectionEnd, ''); 
          return;
        case 65: // A key - Select All
          this.triggerSelectAll();
          return;
        case 90: // Z key - Undo / Redo
          if( ev.shiftKey ){ // Cmd-Shift-Z redo
            this.clipboardUtils.hideArea();
            this.historyUtils.redo(ev);
          }else{ // Cmd-Z undo
            this.clipboardUtils.hideArea();
            this.historyUtils.undo(ev);
          }
          return;
      }
      if( ev.charCode-0 === 0 ){
        this.prepareClipboardOverlay();
      }
    }else{
      switch(ev.keyCode){
        case 27: // ESC key
          this.singleCellEditingMode = false;
          this.clipboardUtils.hideArea();
          return;
        case 46: // Delete key - Clear Cells
          this.setValueMultiCell(this.selectionStart, this.selectionEnd, ''); 
          return;
        case 9: // Tab key already moves cells to right, but now we save state on each key press
          this.storeStateInHistory();
          return;
        case 13: // Enter key - move to next cell
          this.moveToNextCell();
          return;
      }
    }
  };

  this.keyboardUpEvents = function(ev){
    if( this.hasFocus && this.clipboardUtils.hideArea() ){
      setTimeout(this.activatePreviousCell.bind(this), 10);
    }
  };

  this.triggerSelectAll = function(){
    var selSize = this.selectionSize();
    if( selSize.total == 1 ){
      this.activeCell.select();
      this.singleCellEditingMode = false;
      this.clipboardUtils.hideArea();
    }
  };

  // you may wish override this functionality so the return key does something else!
  this.moveToNextCell = function(){
    var selSize = this.selectionSize();
    if( selSize.total > 1  ){
      this.activeCellIndex.y++; 

      if( this.activeCellIndex.y > this.selectionEnd.y ){
        this.activeCellIndex.y = this.selectionStart.y;
        this.activeCellIndex.x += 1;
        if( this.activeCellIndex.x > this.selectionEnd.x ){
          this.activeCellIndex.x = this.selectionStart.x;
        }
      }
      this.activeCell = this.tableCells[this.activeCellIndex.y][this.activeCellIndex.x];
      this.activeCell.select();

    }else{
      // if selections size is zero, move down one cell
      if( this.tableCells[this.activeCellIndex.y+1] ){
        this.activeCell = this.tableCells[this.activeCellIndex.y+1][this.activeCellIndex.x];
        this.activeCellIndex.y += 1;
        this.activeCell.select();
      }
    }
    if( !this.isDragging ) this.storeStateInHistory(); // in case we made a change and pressed return
    this.activeCell.scrollIntoViewIfNeeded();
  };

  this.elementIsVisible = function(cell){  // WARN: this only detects visibility of block level elements
    return  cell.clientWidth !== 0 && cell.clientHeight !== 0 && //cell.style.opacity !== 0 &&
            cell.style.visibility !== 'hidden';
  };

  this.cellPosition = function(cell){
    return {
      x: cell.getAttribute('data-xcelify-col') - 0,
      y: cell.getAttribute('data-xcelify-row') - 0
    };
  };

  this.mouseDownContainer = function(ev){
    if( ev.target == this.containerElm || ev.target.matches(this.rowSelector) ) return;
    var evcell = this.findAppropriateEventTarget(ev);
    if( !evcell ){
      this.hideCurrentSelection();
      return;
    }
    if( document.releaseCapture ){
      setTimeout(function(){ // Firefox support
        document.releaseCapture();
      }, 10);
    }
    this.isDragging = true;
    this.activeCell = evcell;

    if( this.hasClass(evcell, this.cellInputClassName) && evcell != ev.target ){ // clicked on the cell (borders), found the input, stop selecting
      setTimeout(function(){
        evcell.select();
        this.singleCellEditingMode = false;
      }, 10);
    }

    this.dragOrigin = this.cellPosition(evcell);
    if( this.pointsEqual(this.activeCellIndex, this.dragOrigin) ){
      this.singleCellEditingMode = true;
    }
    this.activeCellIndex = this.cellPosition(evcell);
    this.mouseMovedProcessor(evcell);
    this.mouseMoveContainer(ev);
  };

  this.mouseUpContainer = function(ev){
    this.isDragging = false;
    var evcell = ev.target;
    if( !this.hasClass(evcell, this.cellInputClassName) ){
      return;
    }
    this.storeStateInHistory(); // in case we just made a change
    var endPosition = this.cellPosition(ev.target);
    if( !this.singleCellEditingMode ){
      var selSize = this.subtractPoints(endPosition, this.activeCellIndex);
      if( selSize.total == 1 ){
        var cursorSelSize = this.activeSelectionSize();
        if( !cursorSelSize ){
          ev.target.select();
        }else{
          this.singleCellEditingMode = true;
        }
      }
    }
  };

  this.mouseMoveContainer = function(ev){
    if( this.isDragging ){
      if( ev.which === 0 ){
        this.isDragging = false; // we cancel the drag if we are back over container but the mouse button is not down
        return;
      }
      this.mouseMovedProcessor(this.findAppropriateEventTarget(ev));
    }
  };

  this.mouseMovedProcessor = function(evcell){
    if( !evcell ) return;
    var currentPosition;
    if( !this.hasClass(evcell, this.cellInputClassName) ){
      if( this.hasClass(evcell, this.headingClassName) ){
        currentPosition = this.cellPosition(evcell);
        this.selectBoxedCells(this.dragOrigin, currentPosition);
      }
      return; // in case user is still dragging, do not cancel until the mouse returns
    }else{
      currentPosition = this.cellPosition(evcell);
      if( this.singleCellEditingMode && !this.pointsEqual(currentPosition, this.activeCellIndex) ){
        this.singleCellEditingMode=false; // so much for single cell editing mode, the active cell has changed
      }else{
        if( this.pointsEqual(currentPosition, this.activeCellIndex) ){
          var cursorSelSize = this.activeSelectionSize();
          if( cursorSelSize > 0 ){
            singleCellEditingMode=true; // allow return to single editing mode on accidental multi box select
          }
        }
        this.boxCells(this.dragOrigin, currentPosition); // if single editing this is superfluous
      }
    }
  };

  this.findAppropriateEventTarget = function(ev){
    var evcell = ev.target, evinput = ev.target;
    if( !this.hasClass(evcell, this.cellInputClassName) ){
      evinput = evcell.querySelector(this.cellInputQuerySelector);
      if( !evinput ){
        var cellContainer = this.findMatchingParent(evcell, this.cellSelector);
        if( cellContainer ){
          evinput = cellContainer.querySelector(this.cellInputQuerySelector);
        }
      }
      if( !evinput ){
        if( !(evcell = this.descendentOfClass(evcell, this.headingClassName)) ){
            this.hideCurrentSelection();
            return null;
        }
      }else{
        evcell = evinput;
      }
    }
    return evcell;
  };

  this.findMatchingParent = function(child, selector){
    while( child && ! child.matches(selector)  ){ // use of .matches here might need some compatibility // https://developer.mozilla.org/en-US/docs/Web/API/Element/matches
      child = child.parentNode;
      child = child.parentNode ? child : false; // document has no parentNode, stop when we reach an element without parent.
    }
    return child;
  };

  this.descendentOfClass = function(child, className){
    return this.findMatchingParent(child, '.'+className);
  };

  this.hasClass = function(elm, className){
    return elm.className.indexOf(className) > -1;
  };

  this.applyHistoryState = function(stateData){
    this.applyingHistoryState = true;
    this.setMultiValueMultiCell(this.fullGrid, {x:0, y:0}, stateData);
    this.applyingHistoryState = false;
  };

  this.storeStateInHistory = function(){
    if( !this.applyingHistoryState ){
      this.historyUtils.addState(this.getAllCellValues(this.fullGrid));
    }
  };

  // the idea here is to capture unique states, and support undo and redo states
  this.historyUtils = {
    historyStates:  [],
    maxStates: 50,
    stateIndex: -1,
    buttonBarElements: null,
    storeStateFn: null,
    applyStateFn: function(){},
    addState: function(data){
      data = JSON.stringify(data);
      if( this.historyStates[this.stateIndex] != data ){ // if data changed, store it!
        if( this.stateIndex < this.historyStates.length-1 ){
          this.historyStates.splice(this.stateIndex+1); // adding new undo state, clear redo states
        }
        this.historyStates.push(data);
        if( this.historyStates.length > this.maxStates ){
          this.historyStates.splice(0, this.historyStates.length - this.maxStates); // cull old states
        }
        this.stateIndex = this.historyStates.length - 1;
        this.buttonBarUpdate();
      }
    },
    undo: function(ev){
      if( this.storeStateFn ) this.storeStateFn(); // we can always try to add the current state before we undo since duplicate state that equals current is not stored, cannot before redo since we loose future state by adding a new one
      this.stateIndex--;
      if( this.stateIndex < 0 ) this.stateIndex = 0;
      this.applyStateFn(JSON.parse(this.historyStates[this.stateIndex]));
      this.buttonBarUpdate();
      ev.preventDefault();
    },
    redo: function(ev){
      this.stateIndex++;
      if( this.stateIndex >=this.historyStates.length -1 ) this.stateIndex = this.historyStates.length -1;
      this.applyStateFn(JSON.parse(this.historyStates[this.stateIndex]));
      this.buttonBarUpdate();
      ev.preventDefault();
    },
    clear: function(){
      this.historyStates = []; this.stateIndex = -1; this.buttonBarUpdate();
    },
    buttonBarUpdate: function(){
      if( this.buttonBarElements ){
        var bb = this.buttonBarElements;
        if( this.stateIndex >= this.historyStates.length -1 ){
          bb.redo.style.opacity = '0.5';
        }else{
          bb.redo.style.opacity = '1.0';
        }
        if( this.stateIndex <= 0 ){
          bb.undo.style.opacity = '0.5';
        }else{
          bb.undo.style.opacity = '1.0';
        }
      }
    }
  };

  this.clipboardUtils = {
    previouslyFocusedElement: null,
    textareaStyle: 'position:fixed;top:25%;left:25%;right:25%;width:50%;opacity:0.5',
    lastArea: null,
    isShowing: false,
    hideArea: function(){
      var wasShowing = this.isShowing;
      if( this.isShowing ){
        if( this.copyAreaSelector ){
          document.querySelector(this.copyAreaSelector).style.display="none";
        }else if(this.lastArea){
          this.lastArea.style.display="none";
        }
        this.isShowing=false;
      }
      return wasShowing;
    },
    showArea: function(cvalue){
      var n;
      if( this.copyAreaSelector ){
        n = document.querySelector(this.copyAreaSelector);
        n.style.display="block";
        n = n.querySelector('textarea');
      }else if( this.lastArea ){
        n = this.lastArea;
        n.style.display="block";
      }else{
        n=document.createElement('textarea');
        n.setAttribute('style',this.textareaStyle);
        document.body.appendChild(n);
        this.lastArea = n;
      }
      this.isShowing=true;
      if( cvalue ){
        n.value=cvalue;
        setTimeout(function(){n.select();}, 15);
      }else{
        n.value='';
      }
      return n;
    },
    getPaste: function getPaste(cbf){
      var n=this.showArea();
      n.focus();
      n.select();
      setTimeout(function(){
        cbf(n.value);
        this.hideArea();
      }.bind(this), 250); // excessive wait time for paste completion?
    }
  };

  this.getCurrentSelectionForCopy = function(){
      var start = this.selectionStart,
          end   = this.selectionEnd,
          clipb = '';
      for( y=start.y, yl=end.y+1; y<yl; y++ ){
        for( x=start.x, xl=end.x; x<xl; x++ ){
          clipb += this.tableCells[y][x].value+this.delimitCells;
        }
        clipb += this.tableCells[y][x].value+this.delimitRows; // last element in row gets \n instead of \t
      }
      return clipb;
  };

  this.activeSelectionSize = function(){
    if( this.activeCell ) return this.activeCell.selectionEnd - this.activeCell.selectionStart;
    return 0;
  };

  this.captureCellCopy = function(ev){
    var cursorSelSize = this.activeSelectionSize();
    if( cursorSelSize < 1 ) this.singleCellEditingMode = false;
    if( this.singleCellEditingMode ) return; // not sure about this yet
    var clipb = this.getCurrentSelectionForCopy();
    this.hideCopySelection();
    this.copySelectionStart = {x: this.selectionStart.x, y: this.selectionStart.y};
    this.copySelectionEnd = {x: this.selectionEnd.x, y: this.selectionEnd.y};
    this.styleEdges(this.copySelectionStart, this.copySelectionEnd, this.copiedSelectionBorderStyle);
    this.styleCells(this.copySelectionStart, this.copySelectionEnd, '');
    this.curSelectionisCopySel = true;
  };

  this.prepareClipboardOverlay = function(ev){
    var selSize = this.selectionSize();
    var cursorSelSize = this.activeSelectionSize();
    if( selSize.total != 1 || !cursorSelSize ){
      // if we have more than one cell selected or if the current selection within the cell is empty, show copy area
      this.clipboardUtils.showArea(this.getCurrentSelectionForCopy());
    }
  };

  this.activatePreviousCell = function(){
    if(this.activeCell) this.activeCell.focus();
  };

  this.applyCellPaste = function(){
    this.clipboardUtils.getPaste(this.valuesPasted.bind(this));
  };

  this.assembleIndexedPaste = function(activeCell, v){ // designed to be over-ridden
    var val = activeCell.value;
    var selPos = activeCell.selectionStart + v.length;
    var newValue = val.slice(0, activeCell.selectionStart) + v + val.slice(activeCell.selectionEnd, val.length);
    activeCell.value = newValue;
    activeCell.setSelectionRange(selPos, selPos); // reset cursor position
  };

  this.valuesPasted = function(v){
    var pasted = [];
    var rows = this.delimitRows ? v.split(this.delimitRows) : [v]; // it should end with one \n followed by nothing
    var rowCount = 0;
    for( r=0, x=1, rl=rows.length; r<rl; r++,x++ ){
      if( rows[r].length < 1 && x == rl ) continue; // this was to capture last row...
      pasted[r] = [];
      cells = this.delimitCells? rows[r].split(this.delimitCells) : [rows[r]];
      for( c=0, cl=cells.length; c<cl; c++ ){
        pasted[r][c] = cells[c];
      }
      rowCount++;
    }
    if( pasted.length == 1 && pasted[0].length == 1 ){ // determine size of paste is greater than one cell or not, if not perform default paste action
      if( this.singleCellEditingMode ){
        this.assembleIndexedPaste(this.activeCell, v);
        return;
      }
    }

    var selSize = this.selectionSize();
    if( selSize.total > 1 && (rowCount != selSize.y || cl != selSize.x) ){
      var _this = this; // for convenience of over-ridign confirmation function...
      this.selectionConfirmation(selSize, {x: cl, y: rowCount}, function(){
        pasted = _this.replicatePaste(pasted, selSize);
      });
    }
    if( pasted[0] ){
      this.hideCurrentSelection();
      this.selectionEnd = this.validateSelectionCoordinate({x: this.selectionStart.x + pasted[0].length-1, y: this.selectionStart.y + pasted.length-1});
      this.styleActiveSelection();
      this.styleEdges(this.copySelectionStart, this.copySelectionEnd, ''); // hide copy region after paste
    }
    this.setMultiValueMultiCell(this.tableCells, this.selectionStart, pasted);
    setTimeout(this.activatePreviousCell.bind(this), 250);
  };

  this.replicatePaste = function(pasted, selSize){
    var pastedRows = pasted.length, pastedCols = pasted[0].length;
    for( r=0, rl=selSize.y; r<rl; r++ ){
      pasted[r] = pasted[r%pastedRows];
      for( c=0, cl=selSize.x; c<cl; c++ ){
        pasted[r][c] = pasted[r][c%pastedCols];
      }
    }
    return pasted;
  };

  this.selectionConfirmation = function(selSize, clipSize, cbf){ // override
    if( confirm('Selection size ('+selSize.x+', '+selSize.y+') mismatches clipboard size ('+clipSize.x+', '+clipSize.y+')\n\nPaste will continue, replicate clipboard contents across selection?') ){
      cbf();
    }
  };

  this.getAllCellValues = function(gridToRead){
    var allValues = [];
    for( y=0,yl=gridToRead.length; y<yl; y++ ){
      allValues[y] = [];
      for( x=0,xl=gridToRead[y].length; x<xl; x++ ){
        allValues[y][x] = gridToRead[y][x].value;
      }
    }
    return allValues;
  };

  this.setMultiValueMultiCell = function(gridToSet, start, values){
    for( y=0,yl=values.length; y<yl; y++ ){
      for( x=0,xl=values[y].length; x<xl; x++ ){
        cell = gridToSet[y+start.y];
        if( cell ){
          cell = cell[x+start.x];
          if( cell ){
            cell.value = values[y][x];
            cell.dispatchEvent(new Event('change'));
          }
        }
      }
    }
    this.storeStateInHistory();
  };

  this.setValueMultiCell = function(start, end, value){
    for( y=start.y,yl=end.y+1; y<yl; y++ ){
      for( x=start.x,xl=end.x+1; x<xl; x++ ){
        this.tableCells[y][x].value = value;
      }
    }
    this.storeStateInHistory();
  };

  this.styleCells = function(start, end, backgroundStyle){
    y=start.y, yl=end.y+1;
    if( !this.tableCells[y] ) return;
    for( ; y<yl; y++ ){
      for( x=start.x,xl=end.x+1; x<xl; x++ ){
        this.tableCells[y][x].style.background = backgroundStyle;
      }
    }
  };

  this.styleEdges = function(start, end, borderStyle){
    x=start.x, xl=end.x, y=start.y, yl=end.y;
    if( !this.tableCellContainers[y] ) return;
    for( ; y<=yl; y++ ){
      this.drawBorder(this.tableCellContainers[y][x], 'left', borderStyle);
      this.drawBorder(this.tableCellContainers[y][xl], 'right', borderStyle);
    }
   for( y=start.y; x<=xl; x++ ){
      this.drawBorder(this.tableCellContainers[y][x], 'top', borderStyle);
      this.drawBorder(this.tableCellContainers[yl][x], 'bottom', borderStyle);
    }
  };

  this.drawBorder = function(cell, side, borderStyle){
    cell.style['border-'+side] = borderStyle;
  };

  this.validateStartCoord = function(c){
    if( isNaN(c.x) ) c.x = 0;
    if( isNaN(c.y) ) c.y = 0;
    return this.validateSelectionCoordinate(c);
  };

  this.validateEndCoord = function(c){
    if( isNaN(c.x) ) c.x = this.tableCells[0].length-1;
    if( isNaN(c.y) ) c.y = this.tableCells.length-1;
    return this.validateSelectionCoordinate(c);
  };

  this.validateSelectionCoordinate = function(coordinate){
    if( coordinate.y > this.tableCells.length-1){
      coordinate.y = this.tableCells.length-1;
    }
    if( coordinate.x > this.tableCells[0].length-1){
      coordinate.x = this.tableCells[0].length-1;
    }
    if( coordinate.y < 0 ) coordinate.y = 0;
    if( coordinate.x < 0 ) coordinate.x = 0;
    return coordinate;
  };

  this.styleActiveSelection = function(){
      this.styleCells(this.selectionStart, this.selectionEnd, this.selectionBackgroundStyle);
      this.styleEdges(this.selectionStart, this.selectionEnd, this.selectionBorderStyle);
  };

  this.hideCurrentSelection = function(){
    this.styleEdges(this.selectionStart, this.selectionEnd, '');
    this.styleCells(this.selectionStart, this.selectionEnd, '');
  };

  this.hideCopySelection = function(){
    this.styleEdges(this.copySelectionStart, this.copySelectionEnd, '');
    this.styleCells(this.copySelectionStart, this.copySelectionEnd, '');
  };

  this.selectColumn = function(index){
    this.selectBoxedCells(
      {x: index, y: 0},
      {x: index, y: this.totalDimensions.y}
    );
  };

  this.selectRow = function(index){
    this.selectBoxedCells(
      {x: 0, y: index},
      {x: this.totalDimensions.x, y: index}
    );
  };

  this.selectAll = function(){
    this.selectBoxedCells(
      {x: 0, y: 0},
      {x: this.totalDimensions.x, y: this.totalDimensions.y}
    );
  };

  this.selectBoxedCells = function(startPos, endPos){
    startPos = this.validateStartCoord(startPos);
    endPos = this.validateEndCoord(endPos);
    this.activeCell = this.tableCells[startPos.y][startPos.x];
    if( this.activeCell ){
      this.activeCellIndex = this.cellPosition(this.activeCell);
      this.boxCells(startPos, endPos);
      var activeCell = this.activeCell;
      setTimeout(function(){activeCell.focus();}, 10);
    }
  };

  this.boxCells = function(startPos, endPos){ // also orders start/end position for us
    var startx = startPos.x, endx = endPos.x, starty = startPos.y, endy = endPos.y;
    if( startPos.x > endPos.x ){
      startx = endPos.x, endx = startPos.x;
    }
    if( startPos.y > endPos.y ){
      starty = endPos.y, endy = startPos.y;
    }
    if( this.curSelectionisCopySel ){
      this.curSelectionisCopySel = false;
    }else{
      this.hideCurrentSelection();
    }
    this.selectionStart = {x: startx, y: starty};
    this.selectionEnd = {x: endx, y: endy};
    this.styleActiveSelection();
  };

  this.subtractPoints = function(end, start){
    var obj = {
      x: end.x+1 - start.x,
      y: end.y+1 - start.y
    };
    obj.total = Math.abs(obj.x * obj.y);
    return obj;
  };

  this.pointsEqual = function(a, b){
    return a.x == b.x && a.y == b.y;
  };

  this.selectionSize = function(){
    return this.subtractPoints(this.selectionEnd, this.selectionStart);
  };

  this.init(startupOptions); // new Xcellify(startupOptions);
};
