'use strict';
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import {
  window,
  workspace,
  ExtensionContext,
  Range,
  TextDocumentChangeEvent,
  TextDocumentContentChangeEvent,
} from 'vscode';
import {
  extension,
  updateContextDecorations,
  generateDecorations,
  removeDuplicateDecorations,
  ColorizeContext
} from './extension';
import ColorUtil, { IDecoration, DocumentLine, LineExtraction } from './lib/util/color-util';
import VariablesManager from './lib/variables/variables-manager';
import EditorManager from './lib/editor-manager';
import { mutEditedLine } from './lib/util/mut-edited-line';
import { equals } from './lib/util/array';
import TasksRunner from './lib/tasks-runner';

const taskRuner: TasksRunner = new TasksRunner();

const clearDecoration = (decoration: IDecoration) => decoration.dispose();

interface DecoPositionUpdate {
  old: number;
  updated: number;
}

function filterPositions(position: DecoPositionUpdate, deco: Map<number, IDecoration[]>, diffLine: number) {
  if (position.updated === null) {
    deco.get(position.old).forEach(clearDecoration);
    return false;
  }
  if (position.updated === 0 && extension.editor.document.lineCount === 1 && extension.editor.document.lineAt(0).text === '') {
    deco.get(position.old).forEach(clearDecoration);
    return false;
  }
  if (Math.abs(position.old - position.updated) > Math.abs(diffLine)) {
    position.updated = position.old + diffLine;
  }
  return true;
}

function disposeDecorationsForEditedLines(editedLine: TextDocumentContentChangeEvent[], context: ColorizeContext) {
  editedLine.map(({range}: TextDocumentContentChangeEvent) => {
    const line = range.start.line;
    if (context.deco.has(line)) {
      context.deco.get(line).forEach(clearDecoration);
    }
  });
}

function updatePositionsDeletion(range: Range, positions: DecoPositionUpdate[]) {
  let rangeLength = range.end.line - range.start.line;
  positions.forEach(position => {
    if (position.updated === null) {
      return;
    }
    if (position.old > range.start.line && position.old <= range.end.line) {
      position.updated = null;
      return;
    }
    if (position.old >= range.end.line) {
      position.updated = position.updated - rangeLength;
    }
    if (position.updated < 0) {
      position.updated = 0;
    }
  });
  return positions;
}

function getRemovedLines(editedLine: TextDocumentContentChangeEvent[], positions: DecoPositionUpdate[]) {
  editedLine.reverse();
  editedLine.forEach((line: TextDocumentContentChangeEvent) => {
    for (let i = line.range.start.line; i <= line.range.end.line; i++) {
    // ?
    // for (let i = line.range.start.line; i <= context.editor.document.lineCount; i++) {
      VariablesManager.deleteVariableInLine(extension.editor.document.fileName, i);
    }
    positions = updatePositionsDeletion(line.range, positions);
  });
  return editedLine;
}

function getAddedLines(editedLine: TextDocumentContentChangeEvent[], positions: DecoPositionUpdate[]) {
  editedLine = mutEditedLine(editedLine);
  editedLine.forEach((line) => {
    positions.forEach(position => {
      if (position.updated >= line.range.start.line) {
        position.updated = position.updated + 1;
      }
    });
  });

  return editedLine;
}

function getEditedLines(editedLine: TextDocumentContentChangeEvent[], context: ColorizeContext, diffLine: number) {
  let positions: DecoPositionUpdate[] = Array
    .from(context.deco.keys())
    .map(position => ({
      old: position,
      updated: position
    }));

  if (diffLine < 0) {
    editedLine = getRemovedLines(editedLine, positions);
  } else {
    editedLine = getAddedLines(editedLine, positions);
  }
  positions = positions.filter(position => filterPositions(position, context.deco, diffLine));
  context.deco = positions.reduce((decorations, position) => {
    if (decorations.has(position.updated)) {
      const decos: IDecoration[] = decorations.get(position.updated).concat(context.deco.get(position.old));
      decos.forEach(deco => deco.generateRange(position.updated));
      return decorations.set(position.updated, decos);
    }
    const decos: IDecoration[] = context.deco.get(position.old);
    decos.forEach(deco => deco.generateRange(position.updated));
    return decorations.set(position.updated, context.deco.get(position.old));
  }, new Map());
  return editedLine;
}

function getDecorationsToColorize(colors: LineExtraction[], variables: LineExtraction[]): Map<number, IDecoration[]> {
  let decorations = generateDecorations(colors, variables, new Map());

  function filterDuplicated(A: IDecoration[], B: IDecoration[]) {
    return A.filter((decoration: IDecoration) => {
      const exist = B.findIndex((_: IDecoration) => {
        let position = decoration.currentRange.isEqual(_.currentRange);
        if (decoration.rgb === null && _.rgb !== null) {
          return false;
        }
        let colors = equals(decoration.rgb, _.rgb);
        return position && colors;
      });
     return exist === -1;
    });
  }

  extension.editor.visibleRanges.forEach(range => {
    let i = range.start.line;

    for (i; i <= range.end.line + 1; i++) {
      if (extension.deco.has(i) === true && decorations.has(i) === true) {
        // compare and remove duplicate and remove deleted ones
        decorations.set(i, filterDuplicated(decorations.get(i), extension.deco.get(i)));
      }

      if (extension.deco.has(i) && !decorations.has(i)) {
        // dispose decorations
        extension.deco.get(i).forEach(clearDecoration);
      }
    }
  });
  cleanDecorationMap(decorations);
  return decorations;
}

function getCurrentRangeText(): DocumentLine[] {
  let text = extension.editor.document.getText();
  const fileLines: DocumentLine[] = ColorUtil.textToFileLines(text);
  let lines: DocumentLine[] = [];
  extension.editor.visibleRanges.forEach((range: Range) => {
    let i = range.start.line;
    for (i; i <= range.end.line + 1; i++) {
      if (fileLines[i] && fileLines[i].line !== null) {
        lines.push(fileLines[i]);
      }
    }
  });
  return lines;
}

// Need to regenerate  variables decorations when base as changed
function* handleVisibleRangeEvent() {

  // trigger on ctrl + z ????
  // yield new Promise(resolve => setTimeout(resolve, 50));
  let text = extension.editor.document.getText();
  const fileLines: DocumentLine[] = ColorUtil.textToFileLines(text);
  let lines = getCurrentRangeText();
  yield VariablesManager.findVariablesDeclarations(extension.editor.document.fileName, fileLines);
  let variables: LineExtraction[] = yield VariablesManager.findVariables(extension.editor.document.fileName, lines);
  const colors: LineExtraction[] = yield ColorUtil.findColors(lines);

  let decorations = getDecorationsToColorize(colors, variables);
  EditorManager.decorate(extension.editor, decorations, extension.currentSelection);
  updateContextDecorations(decorations, extension);
  removeDuplicateDecorations(extension);
}


function* updateDecorations() {
  yield new Promise(resolve => setTimeout(resolve, 50));
  const fileName = extension.editor.document.fileName;
  const fileLines: DocumentLine[] = ColorUtil.textToFileLines(extension.editor.document.getText());
  let lines = getCurrentRangeText();

  VariablesManager.removeVariablesDeclarations(extension.editor.document.fileName);
  cleanDecorationMap(extension.deco);

  yield VariablesManager.findVariablesDeclarations(fileName, fileLines);
  const variables: LineExtraction[] = yield VariablesManager.findVariables(fileName, lines);
  const colors: LineExtraction[] = yield ColorUtil.findColors(lines, fileName);
  let decorations = getDecorationsToColorize(colors, variables);
  // removeDuplicateDecorations(decorations);
  EditorManager.decorate(extension.editor, decorations, extension.currentSelection);
  updateContextDecorations(decorations, extension);
  removeDuplicateDecorations(extension);
}

// Return new map?
function cleanDecorationMap(decorations: Map<number, IDecoration[]>) {
  let it = decorations.entries();
  let tmp = it.next();
  while (!tmp.done) {
    let line = tmp.value[0];
    let deco = tmp.value[1];
    decorations.set(line, deco.filter(decoration => !decoration.disposed));
    tmp = it.next();
  }
}

function textDocumentUpdated(event: TextDocumentChangeEvent) {
  if (event.contentChanges.length === 0) {
    return;
  }
  if (extension.editor && event.document.fileName === extension.editor.document.fileName) {
    extension.editor = window.activeTextEditor;
    let editedLine = event.contentChanges.map(_ => _);

    let diffLine = extension.editor.document.lineCount - extension.nbLine;
    if (diffLine !== 0) {
      editedLine = getEditedLines(editedLine, extension, diffLine);
      extension.nbLine = extension.editor.document.lineCount;
    }
    disposeDecorationsForEditedLines(editedLine, extension);
    taskRuner.run(updateDecorations);
  }
}

function setupEventListeners(context: ExtensionContext) {
  // window.onDidChangeTextEditorSelection((event) => q.push((cb) => handleTextSelectionChange(event, cb)), null, context.subscriptions);
  workspace.onDidChangeTextDocument(textDocumentUpdated, null, context.subscriptions);
  window.onDidChangeTextEditorVisibleRanges(() => taskRuner.run(handleVisibleRangeEvent), null, context.subscriptions);
  // window.onDidChangeTextEditorVisibleRanges(handleVisibleRangeEvent, null, context.subscriptions);
}

export default { setupEventListeners };
