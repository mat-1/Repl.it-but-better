const editorElId = 'editor'
const terminalElId = 'terminal'
const runButtonElId = 'runButton'

function createRef() {
	var result = '';
	var characters = 'abcdefghijklmnopqrstuvwxyz0123456789';
	var charactersLength = characters.length;
	for (var i = 0; i < 11; i++) {
		result += characters.charAt(Math.floor(Math.random() * charactersLength));
	}
	return result;
}

function isEmptyObject(obj) {
	return Object.entries(obj).length === 0 && obj.constructor === Object
}

function setupAce() {
	var EditSession = ace.require('ace/edit_session').EditSession;
	var Range = ace.require('ace/range').Range;

	var aceEditor = ace.edit(
		editorElId
	);
	aceEditor.setTheme('ace/theme/monokai');
	aceEditor.session.setMode('ace/mode/python');
	aceEditor.setOptions({
		'maxLines': 40,
		'copyWithEmptySelection': true,
		'useSoftTabs': true
	})
	aceEditor.session.setOptions({
		'tabSize': 2
	})
	editor.EditSession = EditSession
	editor.Range = Range
	editor.aceEditor = aceEditor
	aceEditor.on('change', (e) => {
		if (aceEditor.curOp && aceEditor.curOp.command.name) {
			const aceCommand = aceEditor.curOp.command.name 
			console.log(e)
			const skip = getSkip(e.start.row, e.start.column)
			const endPos = getSkip(e.end.row, e.end.column)
			var newOps = []
			if (skip > 0) {
				newOps.push({
					skip: skip
				})
			}
			if (aceCommand == 'insertstring') {
				newOps.push({
					insert: e.lines.join('\n')
				})
			}
			else if (aceCommand == 'backspace') {
				newOps.push({
					delete: endPos - skip
				})
				// console.log('endpos', endPos, 'skip', skip)
			}
			var createdRef = createRef()
			var query = {
				'ot': {
					version: editor.otVersion,
					ops: newOps
				},
				// 'ref': createdRef
			}
			console.log('query', query)
			var ch = editor.crosis.channels.fileTransforms[editor.activeFile]
			console.log(editor.activeFile)
			if (editor.justEdited || editor.sendQueue.length >= 1) {
				var addingToQueue = [ch, query]
				console.log('added to queue', addingToQueue, editor.justEdited, editor.sendQueue.length)
				editor.sendQueue.push(addingToQueue)
			} else {
				console.log('<- ot,', query)
				editor.justEdited = true
				ch.request(query)
				// console.log('<<- ot,')
			}

			//console.log(JSON.stringify(newOps))
		} else {
			console.log('bruh', e, aceEditor.curOp)
		}
	})
}


function readFile(fileName) {
	editor.crosis.channels.files.request({
		read: {
			path: fileName
		}
	}); 
}
function readFileDir(dir='.') {
	editor.crosis.channels.files.request({
		readDir: {
			path: dir
		}
	}); 
}

function getRowColumn(skip, text) {
	if (!text) {
		text = editor.aceEditor.getValue()
	}
	console.log(text)
	const sliced = text.slice(0, skip)
	const split = sliced.split('\n')
	const row = split.length - 1
	const column = split.pop().length
	console.log('getRowColumn', skip, sliced, split, column, row)
	return {
		column: column,
		row: row
	}
}
function getSkip(row, column, text) {
	if (!text)
	  text = editor.aceEditor.getValue()
	const lines = (text + '\n').split('\n')
	const slicedLines = lines.slice(0, row + 1)
	const lastLine = slicedLines.slice(-1).pop()
	const joinedLines = slicedLines.join('\n')
	const skip = joinedLines.length - (lastLine.length - column)
	// console.log('skip', row, column, skip, joinedLines)
	return skip
}

function insertText(text, rowColumn) {
	editor.aceEditor.session.insert(rowColumn, text)
}

function deleteText(startPos, deleteAmount) {
	const startRowColumn = getRowColumn(startPos)
	const startRow = startRowColumn.row
	const startColumn = startRowColumn.column
	
	const endPos = startPos + deleteAmount
	const endRowColumn = getRowColumn(endPos)
	const endRow = endRowColumn.row
	const endColumn = endRowColumn.column
	
	//console.log(startPos + ' ' + deleteAmount + ' | ' + startRow + ' ' + startColumn + '  ' + endRow + ' ' + endColumn)

	const deleteRange = new editor.Range(startRow, startColumn, endRow, endColumn)
	//editor.aceEditor.setSelection(deleteRange)


	editor.aceEditor.session.remove(deleteRange)
}


async function processOt(otData) {
	const version = otData.version || 0
	editor.otVersion = version
	if (editor.justEdited) {
		console.log('just edited, throwing away ot', otData)
		return
	}
	const ops = otData.ops
	var skipAmount = 0
	for (const op of ops) {
		if (op.insert) {
			insertText(op.insert, getRowColumn(skipAmount))
		} else if (op.skip) {
			skipAmount += op.skip
		} else if (op.delete) {
			deleteText(skipAmount, op.delete)
		}
	}
}

async function sendFromQueue() {
	if (editor.sendQueue.length >= 1) {
		const data = editor.sendQueue.shift()
		const ch = data[0]
		var query = data[1]
		query.ot.version = editor.otVersion
		console.log('taken from queue', data, editor.sendQueue)
		if (editor.sendQueue.length == 0)
			editor.justEdited = false
		editor.sendingRequestFromQueue = true
		console.log('<- ot', query)
		editor.justEdited = true
		await ch.request(query)
		console.log('<<- ot')
		editor.sendingRequestFromQueue = false
	}
}

function openFile(fileName) {
	const fileTransformCh = editor.crosis.client.openChannel({ // transforming files
		service: 'ot',
		name: 'ot:' + fileName
	});

	fileTransformCh.request({
		otLinkFile: {
			file: {
				path: fileName
			}
		}
	})

	editor.crosis.channels.fileTransforms[fileName] = fileTransformCh
	editor.activeFile = fileName

	fileTransformCh.on('command', async (command) => {
		console.log('-> ot', command)
		if (command.ot) {
			processOt(command.ot)
		} else if (command.ok) {
			editor.justEdited = false
			console.log('just gotten edit confirmation', command)
			sendFromQueue()

		} else if (command.otstatus) {
			const contents = command.otstatus.contents
			const filePath = command.otstatus.linkedFile ? command.otstatus.linkedFile.path : editor.defaultFile

			editor.otVersion = command.otstatus.version
			insertText(contents, getRowColumn(0))
		}
	});
}

function setupRunButton() {
	window.editor.runButtonEl.addEventListener('click', () => {
		
	})
}

async function setupCrosis() {
	var Client = window.Crosis.Client
	console.log('Client')
	const client = new Client();
	console.log('client', window.token)
	await client.connect({
		'token': window.token,
		urlOptions: {
			secure: true,
			port: '443'
		}
	});
	client.on('close', () => {
		console.log('Closed! Trying to reconnect...')
		setupCrosis()
	})
	console.log('connected')
	
	const execCh = client.openChannel({ // shell commands
		service: 'exec'
	});
	const filesCh = client.openChannel({ // editing files i think except maybe not
		service: 'file'
	});
	const fsEventsCh = client.openChannel({ // detect file system changes
		service: 'fsevents'
	});
	const interpreterCh = client.openChannel({
		service: 'interp2'
	});
	const snapshotCh = client.openChannel({ // repl saving
		service: 'snapshot'
	});
	const lspCh = client.openChannel({ // language server (?)
		service: 'lsp'
	});
	const packagerCh = client.openChannel({
		service: 'packager3'
	})
	// const gcsfilesCh = client.openChannel({ // language server (?)
	// 	service: 'gcsfiles'
	// });
	
	editor.crosis = {}
	editor.crosis.channels = {
		files: filesCh,
		packager: packagerCh,
		fileTransforms: {},
		// gcsfiles: gcsfilesCh
	}
	editor.crosis.client = client
	editor.otVersion = 0
	editor.justEdited = false
	editor.sendingRequestFromQueue = false
	editor.sendQueue = []

	openFile(editor.defaultFile)

	interpreterCh.on('command', command => {
		console.log('interp', command)
		termOutput(JSON.stringify(command))
		
	});



	filesCh.on('command', command => {
		console.log('files', command)
		if (command.file) {
			const fileContentRaw = command.file.content
			const fileContent = intArrayToString(fileContentRaw)
			var editSession = new editor.EditSession(fileContent, 'ace/mode/python');
			editor.aceEditor.setSession(editSession)
			//editor.editorEl.innerText = fileContent
		}
	});
	// gcsfilesCh.on('command', command => {
	// 	console.log('gcsfiles', gcsfilesCh)
	// })

	// await interpreterCh.request({
	// 	runMain: {}
	// }); 

	fsEventsCh.request({
		subscribeFile: {
			files: ['.']
		}
	});
	console.log('filesCh')

	readFileDir('.')
	console.log('readFileDir')
	// readFile('main.py')

	/*
	await fileTransformCh.request({
	 	ot: {
			version: 0,
	 		ops: [{ insert: 'hi' }]
	 	}
	}); 
	*/

	

	// client.close();


}

function runRepl() {
	
}

addEventListener('DOMContentLoaded', () => {
	window.editor = {
		editorEl: document.getElementById(editorElId),
		terminalEl: document.getElementById(terminalElId),
		runButtonEl: document.getElementById(runButtonElId),
		channels: {},
		defaultFile: window.replData.fileNames[0]
	}

	
	
	setupAce()
	setupCrosis()
	addDefaultFiles()
	setupRunButton()
})

function intArrayToString(intArray){
	return String.fromCharCode.apply(null, intArray);
}

function addFileToList(fileName, onclick) {
	var fileItemListEl = document.getElementsByClassName('fileItemList')[0]
	var fileItemEl = document.createElement('li')
	fileItemEl.classList.add('fileItem')
	fileItemEl.innerText = fileName
	fileItemListEl.appendChild(fileItemEl)
	if (onclick)
		fileItemEl.addEventListener('click', onclick)
}

function addDefaultFiles() {
	for (const fileName of window.replData.fileNames) {
		addFileToList(fileName)
	}
}
function termOutput(contents) {
	var newLine = document.createElement('p')
	newLine.innerText = contents
	editor.terminalEl.appendChild(newLine)
}