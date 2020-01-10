const editorElId = 'editor'


function setupAce() {
	var EditSession = ace.require('ace/edit_session').EditSession;
	var Range = ace.require('ace/range').Range;

	var aceEditor = ace.edit(
		editorElId
	);
	aceEditor.setTheme('ace/theme/monokai');
	aceEditor.session.setMode('ace/mode/python');
	aceEditor.setOption("maxLines", 40);
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
				console.log('endpos', endPos, 'skip', skip)
			}
			var query = {
				'ot': {
					version: editor.otVersion,
					ops: newOps
				}
			}
			//alert(editor.otVersion)
			console.log('query', query)
			var ch = editor.crosis.channels.fileTransforms[editor.activeFile]
			console.log(editor.activeFile)
			ch.request(query)
			editor.justEdited = true

			//console.log(JSON.stringify(newOps))
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
	console.log('skip', row, column, skip, joinedLines)
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


function processOt(otData) {
	const version = otData.version || 0
	editor.otVersion = version
	if (editor.justEdited) {
		//alert('just edited')
		editor.justEdited = false
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

function openFile(fileName) {
	const fileTransformCh = editor.crosis.client.openChannel({ // transforming files
		service: 'ot',
		name: 'ot:' + fileName
	});
	editor.crosis.channels.fileTransforms[fileName] = fileTransformCh
	editor.activeFile = fileName

	fileTransformCh.on('command', command => {
		console.log('ot', command)
		if (command.ot) {
			processOt(command.ot)
		} else if (command.otstatus) {
			const contents = command.otstatus.contents
			const filePath = command.otstatus.linkedFile.path
			editor.otVersion = command.otstatus.version
			insertText(contents, getRowColumn(0))
		}
	});
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
	editor.crosis = {}
	editor.crosis.channels = {}
	editor.crosis.channels.files = filesCh
	editor.crosis.channels.fileTransforms = {}
	editor.crosis.client = client
	editor.otVersion = 0
	editor.justEdited = false

	openFile('main.py')

	interpreterCh.on('command', command => {
		console.log('interp', command)
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
	// await fileTransformCh.request({
	// 	otLinkFile: {
	// 		file: {
	// 			path: 'main.py'
	// 		}
	// 	}
	// })
	

	// client.close();


}
addEventListener('DOMContentLoaded', () => {
	window.editor = {
		editorEl: document.getElementById(editorElId),
		channels: {}
	}
	
	setupAce()
	setupCrosis()

})

function intArrayToString(intArray){
	return String.fromCharCode.apply(null, intArray);
}