/*
  Copyright (c) 2012 Brian Silverman, Barry Silverman, Ed Spittles
*/

// chip-specific support including user interface

var chipname='ARM1';
var chipsize=30000;

var ChipWindow = null;
var MemoryTable;
var FrontPanelWindow;
var ChipPinTable;
var RegisterTable;
var FrontPanelDiv;
var PopoutFrontPanelDiv;
var Popoutstatbox;

var selected; // for the memory editor

var logThese=[];
var logstream = Array();
var presetLogLists=[
    ['cycle'],
    ['phi1', 'phi2', 'address', 'databus', 'rw'],
    ['opc', 'pc', 'r14', 'psr'],
    ['a_bus', 'b_bus', 'shout'],
    ['ireg'],
    ['r3', 'r2', 'r1', 'r0'],
    ['mreq', 'seq'],
];

function initPopout(doc, content){
    doc.open();
    doc.write(content);
    doc.close();
}

function popoutFrontPanel() {
    // we can't open a popout from a non-blank URL because we could
    // not then access the DOM
    FrontPanelWindow = open("","FrontPanel","width=600,height=400");
    initPopout(
        FrontPanelWindow.document,
        '<html><head><title>Front Panel</title></head><body>' + 
            chipname + ' Front Panel:'+
            '<div id=frontpaneldiv>'+
            '</div>' +
            '</body></html>'
    );
    setupFrontPanel();
    updateFrontPanel();
    FrontPanelWindow.focus();
}

/*
  We could have one or two front panels to set up.
  The idea of the popout front panel is to allow an uncluttered fully 
  graphical view and allow for a two-monitor setup.  (Also allowed by
  the popout layout view)
*/
function setupFrontPanel(){
    var fpd = document.getElementById("frontpaneldiv");
    var fpdcontent= '<div class="ms" id="status" >' +
        '</div>' +
        '<div class="ms" >' + 
        '<table style="border-collapse:collapse;" id=pins></table></div>' +
        '<div class="ms" >' + 
        '<table style="border-collapse:collapse;" id=registers></table></div>';
    fpd.innerHTML = fpdcontent;
    fpd.setAttribute('style','font-size:small;');

    FrontPanelDiv = fpd;

    ChipPinTable  = document.getElementById("pins");
    RegisterTable = document.getElementById("registers");
    statbox = document.getElementById('status');

    if ((typeof FrontPanelWindow != 'undefined') &&
        (FrontPanelWindow.parent != null)) {
        PopoutFrontPanelDiv = FrontPanelWindow.document.getElementById("frontpaneldiv");
        PopoutFrontPanelDiv.innerHTML = fpd.innerHTML;
        Popoutstatbox = FrontPanelWindow.document.getElementById('status');
    }
}

/* we could have one or two front panels to update */
function updateFrontPanel(){
    updateChipPins();
    updateRegisters();

    if (logThese.length>0) {
        updateLogbox(logThese);
    }

    // update the status
    var ab = readAddressBus();
    var machine1 =
        ' cycle:' + (cycle>>1) +
        ' phi2:' + (isPadHigh('phi2')?1:0) +
        ' A:' + hex(readAddressBus()) +
        ' D:' + hex(readDataBus()) +
        ' ' + (isPadHigh('rw')?'r':'w');
    var machine2 =
        ' r15(pc):' + readRegHex('r15') +
        ' ' + CPUModeAsString() + 
        ' ' + StatusByteAsString() +
        //              ' r14(link):' + readRegHex('r14') +
        //              ' r13(sp):' + readRegHex('r13') +
        //              ' r1:' + readRegHex('r1') +
        ' r0:' + readRegHex('r0');
    var machine3 = 
        'Hz: ' + estimatedHz().toFixed(1);
    setStatus(machine1, machine2, machine3);

    //  selectCell(ab>>2);

    // finally, replicate to the popped-out front panel, if it exists
    if ((typeof FrontPanelWindow != 'undefined') && 
        (FrontPanelWindow.parent != null)) {
        PopoutFrontPanelDiv.innerHTML = FrontPanelDiv.innerHTML;
    }
}

var prevHzTimeStamp=0;
var prevHzCycleCount=0;
var prevHzEstimate1=1;
var prevHzEstimate2=1;
var HzSamplingRate=10;

// return an averaged speed: called periodically during normal running
function estimatedHz(){
    if(cycle%HzSamplingRate!=3)
        return prevHzEstimate1;
    var HzTimeStamp = now();
    var HzEstimate = (cycle-prevHzCycleCount+.01)/(HzTimeStamp-prevHzTimeStamp+.01);
    HzEstimate=HzEstimate*1000/2; // convert from phases per millisecond to Hz
    if(HzEstimate<5)
        HzSamplingRate=5;  // quicker
    if(HzEstimate>10)
        HzSamplingRate=10; // smoother
    prevHzEstimate2=prevHzEstimate1;
    prevHzEstimate1=(HzEstimate+prevHzEstimate1+prevHzEstimate2)/3; // wrong way to average speeds
    prevHzTimeStamp=HzTimeStamp;
    prevHzCycleCount=cycle;
    return prevHzEstimate1
}

function formatTT(s){
    return '<tt>' + s + '</tt>';
}

function updateChipPins(){
    var padlist1 = ['phi1', 'phi2', 'ale', 'abe', 'dbe', 'abrt', 'irq', 'firq'];
    var padlist2 = ['reset', 'seq', 'm0', 'm1', 'bw', 'rw', 'opc', 'mreq', 'tran'];
    var rowborder='style="border-top:thin solid white;"';
    var border='style="border-right:thin solid white;"';
    var mono='style="font-family:monospace;"';
    if (ChipPinTable == null) {
        setupFrontPanel();
    }
    ChipPinTable.innerHTML =
        list2zebraTableRow(1, padlist1, rowborder, border) +
        list2zebraTableRow(1, padlist1.map(function(x){return isPadHigh(x)?1:0}), mono, border) +
        list2zebraTableRow(2, padlist2, rowborder, border) +
        list2zebraTableRow(2, padlist2.map(function(x){return isPadHigh(x)?1:0}), mono, border);
}

function updateRegisters(){
    var reglists = [
        ['r15 (pc)', 'r14 (link)','r13','r12'], ['r11','r10','r9','r8'],
        ['r7','r6','r5','r4',], ['r3','r2','r1','r0'],
        ['r14_svc', 'r13_svc','',''],
        ['r14_irq', 'r13_irq','','r10_fiq'],
        ['r14_fiq','r13_fiq','r12_fiq','r11_fiq'],
    ];
    var row = [];
    var i=1;

    var rowborder='style="border-top:thin solid white;"';
    var border='style="border-right:thin solid white;"';
    var mono='style="font-family:monospace;"';
    for(var rl = 0; rl < reglists.length; rl++){
        row.push(list2zebraTableRow(i, reglists[rl], rowborder, border));
        row.push(list2zebraTableRow(i, reglists[rl].map(readRegHex), mono, border));
        i++;
    }

    RegisterTable.innerHTML = row.join("");
}

function StatusByteAsString(){
    return      (nodes[psrBits['psr_n']].state ? 'N':'n') +
        (nodes[psrBits['psr_z']].state ? 'Z':'z') +
        (nodes[psrBits['psr_c']].state ? 'C':'c') +
        (nodes[psrBits['psr_v']].state ? 'V':'v') +
        (nodes[psrBits['psr_irq']].state ? 'I':'i') +
        (nodes[psrBits['psr_fiq']].state ? 'F':'f') +
        (nodes[psrBits['psr_s1']].state ? 'S':'s') +
        (nodes[psrBits['psr_s0']].state ? 'S':'s');
}

function CPUModeAsString(){
    var m = (nodes[psrBits['psr_s1']].state ? 1:0)*2 + (nodes[psrBits['psr_s0']].state ? 1:0);
    var s = ['USR', 'FIQ', 'IRQ', 'SVC']
    return '(' + s[m] + ')';
}

function popoutChip(){
    // construct the undocked chip layout

    var fl;
    var frame;
    var chip;

    if (ChipWindow != null){
        teardown();
        return;
    }

    window.document.getElementById('monitor').value = "Pop in";
    frame = window.document.getElementById('armgpu_view');
    ChipWindow = open("","ARM V1","width=600,height=600");
    initPopout(ChipWindow.document, '<head></head><body><div id="float"><div></body>');
    ChipWindow.onbeforeunload = function(e){teardown();}
    fl = ChipWindow.document.getElementById('float');
    fl.appendChild(frame);

    //  window.document.getElementById('staticframe').style.visibility = '';
    ChipWindow.onresize = function(e){handleChipResize(e);}     
    armgpu.appInstance.module_ = ChipWindow.document.getElementById('armgpu');
    handleChipResize();
    ChipWindow.focus();
}

function popinChip(){
    // redock chip layout

    var fl;
    var frame;
    var chip;

    window.document.getElementById('monitor').value = "Pop out";
    //  window.document.getElementById('staticframe').style.visibility = 'hidden';
    frame = ChipWindow.document.getElementById('armgpu_view');
    fl = window.document.getElementById('mainlefthalf');
    fl.appendChild(frame);
    armgpu.appInstance.module_ = window.document.getElementById('armgpu');
}

function handleResize(e){
    // size the 'frame' element according to the browser window size
    // make bottom margin equal to left margin
        var doc = window.document;

    layoutsize = window.innerHeight - 20;
    doc.getElementById('armgpu_view').style.height = layoutsize + 'px';
    doc.getElementById('armgpu').height = layoutsize + 'px';
    doc.getElementById('armgpu_view').style.width = '1100px';
    doc.getElementById('armgpu').width =  '1100px';
}

function handleChipResize(e){
    // size the 'frame' element according to the browser window size
    // make bottom margin equal to left margin
        var doc = ChipWindow.document;

    layoutsize = ChipWindow.innerHeight - 20;
    doc.getElementById('armgpu_view').style.height = layoutsize + 'px';
    doc.getElementById('armgpu').height = layoutsize + 'px';
    doc.getElementById('armgpu_view').style.width = (ChipWindow.innerWidth - 20) + 'px';
    doc.getElementById('armgpu').width = (ChipWindow.innerWidth - 20) + 'px';
}

function setupMemoryTable(){
        // initially we direct ourselves to the docked-in memory table
        MemoryTable = document.getElementById('memtablepanel');
        // create and display the memory table
        updateMemoryTable();
}

var memoryTableWidth=4;

function updateMemoryTable(){
    var memrow = [];
    var base = 0;
    var width = memoryTableWidth;
    var height = 8;
    for(var y = 0; y < height; y++){
        memrow.push(list2tableRow(["0x" + hex(base*4)+":"].concat(memory.slice(base, base + width).map(hex))));
        base = base+width;
    }
    MemoryTable.innerHTML = memrow.join("");
    var rows = MemoryTable.childNodes[0].childNodes;
    for(var i = 0; i < rows.length; i++){
        var row = rows[i].childNodes;
        rows[i].style.fontFamily="monospace";
        if ((typeof row != "undefined") && row.length > 1){
            for(var j = 1; j < row.length; j++){
                var cell = row[j];
                // we allow editting by attaching a handler to each memory cell
                cell.addr = i*memoryTableWidth+j-1
                cell.onmousedown = function(e){handleCellClick(e);};
            }
        }
    }
}

// each memory cell is sensitive to a mouse click, which then directs
// keypresses to this cell
function handleCellClick(e){
    var c = e.target;
    selectCell(c.addr);
    MemoryTable.focus();  // this is not working
}

// memory edit will get key events if a memory panel is visible
function isMemoryEditActive(){
    if (typeof selected == "undefined"){
        return false;
    }

    var memorytabindex = 0;
    var activetabindex = $('#paneltabs').tabs().tabs('option', 'selected');

    // not yet dealing with case of popout or kiosk mode
    if (activetabindex == memorytabindex){
        return true;
    } else {
        return false;
    }
}

// react to hex and navigation keypresses for memory cell edits
function cellKeydown(e){
    var c = e.keyCode;
    if(c==13) unselectCell();
    // space to step forward one cell
    else if(c==32) selectCell((selected+1) % 0x200);
    // backspace to step backward one cell (FIXME: we don't see this unless the memtable element has focus)
    else if(c==8) selectCell((selected-1+0x200) % 0x200);
    // cursor (arrow) keys (FIXME: also afflicted by the mysterious event stealer)
    else if(c==37) selectCell((selected-1+0x200) % 0x200);
    else if(c==38) selectCell((selected-memoryTableWidth+0x200) % 0x200);
    else if(c==39) selectCell((selected+1) % 0x200);
    else if(c==40) selectCell((selected+memoryTableWidth) % 0x200);
    // hex inputs
    else if((c>=48) && (c<58)) setCellValue(selected, (getCellValue(selected)<<4) + c - 48);
    else if((c>=65) && (c<71)) setCellValue(selected, (getCellValue(selected)<<4) + c - 55);
    mWrite(4*selected, getCellValue(selected));
}

function setCellValue(n, val){
    if(val==undefined)
        val=0x00;
    cellEl(n).innerHTML=hex(val);
}

function getCellValue(n){
    var cell=cellEl(n);
    if(cell == undefined)
        return 0
    return ~~("0x" + cellEl(n).innerHTML);
}

function selectCell(n){
    unselectCell();
    if(n>=0x200) return;
    if(typeof cellEl(n) == 'undefined'){
        console.log('selectCell bad call with '+n);
        return;
    }
    if(typeof cellEl(n).style == 'undefined'){
        console.log('selectCell bad style call with '+n);
        return;
    }
    cellEl(n).style.background = '#ff8'; // yellow
    selected = n;
}

function unselectCell(){
    if(typeof selected == "undefined") return;
    cellEl(selected).style.background = '#fff'; // white
    selected = undefined;
    //  window.onkeydown = undefined;
}

function cellEl(n){
    var rows = MemoryTable.childNodes[0].childNodes;
    var r = ~~(n/memoryTableWidth);
    var c = n % memoryTableWidth;
    if (r >= rows.length) return 0;
    if (c > rows[r].childNodes.length) return 0;
    var e = rows[r].childNodes[c+1];
    return e;
}

var helpBox;

function createHelpBox(){
    if (typeof helpBox != "undefined"){
        helpBoxVisible('');
        return;
    }   

    helpBox=document.createElement("div");

    helpBox.style.position="absolute";
    helpBox.style.left="5%";
    helpBox.style.top="5%";
    helpBox.style.width="90%";
    helpBox.style.borderRadius='10px';

    helpBox.style.color='white';
    helpBox.style.backgroundColor='black';

    helpBox.innerHTML="<div style=padding:1em>" +
        "Help window content <span style=float:right id=helpBoxClose><u>Close</u></span>" +
        "<p>" +
        "<p>Needs a table for two columns" +
        "<p>" +
        "<p>Explain keycodes for layout zoom/pan, also for run/step (if we have them)" +
        "<p>" +
        "<p>Thanks to ARM etc." +
        "</div>";

    helpBox.style.zIndex=200;
    helpBox.style.opacity=0.85;
    helpBox.style.visibility='hidden';
    helpBox.style.visibility='';
    document.body.appendChild(helpBox);
    document.getElementById('helpBoxClose').onmouseup = function() {
        helpBoxVisible("hidden");
    };
}

function helpBoxVisible(v){
    helpBox.style.visibility=v;
}

function signalSet(n){
    var signals=[];
    for (var i=0; (i<=n)&&(i<presetLogLists.length) ; i++){
        for (var j=0; j<presetLogLists[i].length; j++){
            signals.push(presetLogLists[i][j]);
        }
    }
    return signals;
}

// called direct from UI element
function updateLogList(names){
    // user supplied a list of signals, which we append to the set defined by loglevel
    logThese = signalSet(loglevel);
    if(typeof names == "undefined")
        // this is a UI call - read the text input
        names = document.getElementById('LogThese').value;
    else
        // this is an URL call - update the text input box
        document.getElementById('LogThese').value = names;
    names = names.split(/[\s,]+/);
    for(var i=0;i<names.length;i++){
        // could be a signal name, a node number, or a special name
        if(typeof busToString(names[i]) != "undefined")
            logThese.push(names[i]);
    }
    initLogbox(logThese);
}

// called direct from UI element
function updateLoglevel(value){
    loglevel = value;
    logThese = signalSet(loglevel);
    initLogbox(logThese);
}

var logbox;
function initLogbox(names){
    logbox=document.getElementById('logstream');
    if(logbox==null)return;

    names=names.map(function(x){return x.replace(/^-/,'')});
    logStream = [];
    logStream.push("<td class=header>" + names.join("</td><td class=header>") + "</td>");
    logbox.innerHTML = "<tr>"+logStream.join("</tr><tr>")+"</tr>";
}

var logboxAppend=true;

// can append or prepend new states to the log table
// when we reverse direction we need to reorder the log stream
function updateLogDirection(){
    var loglines=[];

    logboxAppend=!logboxAppend;

    if(logboxAppend)
        document.getElementById('LogUpDown').value='Log Up';
    else
        document.getElementById('LogUpDown').value='Log Down';

    // the first element is the header so we can't reverse()
    for (var i=1;i<logStream.length;i++) {
        loglines.unshift(logStream[i]);
    }
    loglines.unshift(logStream[0]);
    logStream=loglines;
    logbox.innerHTML = "<tr>"+logStream.join("</tr><tr>")+"</tr>";
}

// update the table of signal values, by prepending or appending
function updateLogbox(names){
    var signals=[];
    var odd=true;
    var bg;
    var row;

    for(var i in names){
        if(cycle % 4 < 2){
            bg = odd ? " class=oddcol":"";
        } else {
            bg = odd ? " class=oddrow":" class=oddrowcol";
        }
        signals.push("<td" + bg + ">" + busToString(names[i]) + "</td>");
        odd =! odd;
    }
    row = "<tr style='font-family:monospace'>" + signals.join("") + "</tr>";

    if(logboxAppend)
        logStream.push(row);
    else
        logStream.splice(1,0,row);

    logbox.innerHTML = logStream.join("");
}

function nodenumber(x){
    // not efficient, but we run it rarely
    // an assumption here about nodedefs being a partner to nodenames
    for(var i=0;i<nodedefs.length;i++){
        if(nodenames[i] == x){
            return i;
        }
    }
    return undefined;
}

function busToString(busname){
    // takes a signal name or prefix
    // returns an appropriate string representation
    // some 'signal names' are CPU-specific aliases to user-friendly string output
    if(busname=='cycle')
        return cycle>>1;
    if(busname in regDisplayMap)
        return readRegHex(busname);
    if(busname=='psr')
        return StatusByteAsString();
    if(busname=='a_bus')
        return busToString('-na');
    if(busname=='b_bus')
        return busToString('-nb');
    if(typeof nodenumber(busname+'_pad') != 'undefined'){
        return isPadHigh(busname)?1:0;
    }
    if(busname[0]=="-"){
        // invert the value of the bus for display
        var value=busToString(busname.slice(1))
        if(typeof value == "undefined") return undefined;
        return hex(~('0x'+value))
    }
    return busToHex(busname);
}

function busToHex(busname){
    // may be passed a bus or a signal: could be a pinname, nodename, nodenumber or a displayname
    // or even a bus of pads, which we must specialcase
    if(busname=='a' || busname=='address' || busname=='addressbus'){
        return hex(readAddressBus());
    }
    if(busname=='d' || busname=='data' || busname=='databus'){
        return hex(readDataBus());
    }
    if(typeof internalBusses[busname] != 'undefined'){
        return hex(readBus(busname));
    }
    if(typeof internalBusses[busname+'_bus'] != 'undefined'){
        return hex(readBus(busname+'_bus'));
    }

}

function teardown(){
    if(ChipWindow != null) {
        popinChip();
        ChipWindow.close();
        ChipWindow = null;
        window.onresize = function(e){handleResize(e);} 
        handleResize();
        window.focus();
    }
    if(typeof(FrontPanelWindow) != "undefined") FrontPanelWindow.close();
}

/* shifter demo program

   @ for coding reference see http://www.bravegnu.org/gnu-eprog/asm-directives.html
   @ and http://www.peter-cockerell.net/aalp/
   @
   @ to build use
   @   as   -o shifter.o shifter.s
   @   objdump -d shifter.o

   .text
   mov     r1, pc        @ inspect status and mode
   mov     r2, #12
   movs    pc, r2
   nop
   nop
   mov     r2, #1        @ initial distance to shift
   mov     r1, #15       @ constant value to shift
   ldr     r3, pointer
   loop:
   ror     r0, r1, r2
   add     r2, r2, #1
   str     r0, [r3], #4  @ write to results array
   b       loop
   pointer:
   .word results
   results:
   .word 0xaa55aa55

*/
var userCode = [];

var memory = Array(
    0xE1A0100F,0xE3A0200C,0xE1B0F002,0xE1A00000,0xE1A00000,0xE3A02001,0xE3A0100F,0xE59F300C,0xE1A00271,0xE2822001,0xE4830004,0xEAFFFFFB,0x00000034,0xAA55AA55);

//var memory = Array(
//0xE1A0100F,0xE3A0200C,0xE1B0F002,0xE1A00000,0xE1A00000,0xE59F3018,0xE3A00000,0xE3A01001,0xE0802001,0xE1A00001,0xE1A01002,0xE4C31001,0xEAFFFFFA,0x00000038,0xAA55AA55);

// ensure all the displayed memory cells are initialised
for(var i=memory.length; i<32; i++)memory[i] = 0;
