import {
  TextEditor,
  Range,
  TextEditorDecorationType,
  Position,
  window
} from 'vscode';
import { generateOptimalTextColor } from '../color-util';
import Color from '../colors/color';
import Variable, { Observer } from './variable';

class VariableDecoration implements Observer {
  public observerId: number = null;
  private _updateCallback: Function;
  /**
   * The color variable used to generate the TextEditorDecorationType
   *
   * @type {Variable}
   * @public
   * @memberOf ColorDecoration
   */
  public variable: Variable;
  /**
   * Keep track of the TextEditorDecorationType status
   *
   * @type {boolean}
   * @public
   * @memberOf ColorDecoration
   */
  public disposed: boolean = false;

  public deleted: boolean = false;

  public currentRange: Range;
  private _decoration: TextEditorDecorationType;
  /**
   * The TextEditorDecorationType associated to the color
   *
   * @type {TextEditorDecorationType}
   * @memberOf ColorDecoration
   */
  get decoration(): TextEditorDecorationType {
    if (this.disposed) {
      this.disposed = false;
      this._generateDecorator();
    }
    return this._decoration;
  }
  set decoration(deco: TextEditorDecorationType) {
    this._decoration = deco;
  }
  public constructor(variable: Variable, line: number) {
    this.variable = variable;
    this._generateDecorator();
    if (this.variable.color) {
      this.generateRange(line);
    } else {
      this.currentRange = new Range(new Position(line, 0), new Position(line, 0));
    }
  }
  /**
   * Disposed the TextEditorDecorationType
   * (destroy the colored background)
   *
   * @public
   * @memberOf ColorDecoration
   */
  public dispose(): void {
    // this.color = null;
    try {
      this.variable.removerObserver(this);
      this._decoration.dispose();
    } catch (error) {}
    this.disposed = true;
  }
  public hide(): void {
    // this.color = null;
    try {
      this._decoration.dispose();
    } catch (error) {}
    this.disposed = true;
  }

  /**
   * Generate the decoration Range (start and end position in line)
   *
   * @param {number} line
   * @returns {Range}
   *
   * @memberOf ColorDecoration
   */
  public generateRange(line: number): Range {
    const range = new Range(new Position(line, this.variable.color.positionInText), new Position(line, this.variable.color.positionInText + this.variable.name.length));
    this.currentRange = range;
    return range;
  }

  private _generateDecorator() {
    if (this.variable.color.rgb) {
      this.deleted = false;
      let backgroundDecorationType = window.createTextEditorDecorationType({
        borderWidth: '1px',
        borderStyle: 'solid',
        borderColor: this.variable.color.toRgbString(),
        backgroundColor: this.variable.color.toRgbString(),
        color: generateOptimalTextColor(this.variable.color)
      });
      this._decoration = backgroundDecorationType;
    } else {
      this.deleted = true;
    }
  }
  addUpdateCallback(callback) {
    this._updateCallback = callback;
  }
  updateDecoration(color: Color) {
    this.deleted = false;
    try {
      this._decoration.dispose();
    } catch (error) {}
    this.variable.color.rgb = color.rgb;
    this._generateDecorator();
    try {
      this._updateCallback(this);
    } catch (error) {}
  }
  disposeDecoration() {
    this.dispose(); // should trigger new search for this variable?
    this.deleted = true;
  }
  update(args: Object[]) {
    const action = args[0];
    this[`${action}Decoration`](...args.slice(1));
  }
}
export default VariableDecoration;
