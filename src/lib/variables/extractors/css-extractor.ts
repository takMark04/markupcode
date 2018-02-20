import VariablesExtractor, { IVariableExtractor } from '../variables-extractor';
import { DocumentLine, LineExtraction, flattenLineExtractionsFlatten } from '../../color-util';
import Variable from '../variable';
import Color, { IColor } from '../../colors/color';
import VariablesStore from '../variable-store';
import ColorExtractor from '../../colors/color-extractor';
const REGEXP_END = '(?:$|\"|\'|,| |;|\\)|\\r|\\n)';

export const REGEXP = new RegExp(`(var\\((--(?:[a-z]+[\-_a-z\\d]*))\\))(?!:)${REGEXP_END}`, 'gi');
export const REGEXP_ONE = new RegExp(`^(var\\((--(?:[a-z]+[\-_a-z\\d]*))\\))(?!:)${REGEXP_END}`, 'i');
export const DECLARATION_REGEXP = new RegExp(`(?:(--(?:[a-z]+[\\-_a-z\\d]*)\\s*):)${REGEXP_END}`, 'gi');

class CssExtractor implements IVariableExtractor {
  public name: string = 'CSS_EXTRACTOR';
  private store: VariablesStore = new VariablesStore();

  public async extractDeclarations(fileName: string, fileLines: DocumentLine[]): Promise<void> {
    fileLines.map(({text, line}) => this.__extractDeclarations(fileName, text, line));
    return;
  }
  public __extractDeclarations(fileName: string, text: string, line: number) {
    let match = null;
    while ((match = DECLARATION_REGEXP.exec(text)) !== null) {
      const varName = (match[1] || match[2]).trim();
      let color = ColorExtractor.extractOneColor(text.slice(match.index + match[0].length).trim()) || this.extractVariable(fileName, text.slice(match.index + match[0].length).trim());
      if (this.store.has(varName, fileName, line)) {
        const decoration = this.store.get(varName, fileName, line);
        if (color === undefined) {
          this.store.delete(varName, fileName, line); // handle by store?? when update (add the same)
        } else {
          decoration[0].update(<Color>color);
        }
        continue;
      }
      if (color === undefined || color === null) {
        continue;
      }
      const variable = new Variable(varName, <Color> color, {fileName, line});
      this.store.addEntry(varName, variable); // update entry??
    }
  }
  public extractVariables(fileName: string, fileLines: DocumentLine[]): Promise<LineExtraction[]> {
    const variables = fileLines.map(({line, text}) => {
      let match: RegExpExecArray = null;
      let colors: Variable[] = [];
      while ((match = REGEXP.exec(text)) !== null) {
        let varName =  match[2];
        varName = varName.trim();
        let value = match[1];
        let spaces = (value.match(/\s/g) || []).length;
        value = value.trim();
        if (!this.store.has(varName)) {
          continue;
        }
        let decorations = this.store.findClosestDeclaration(varName, fileName);
        // if (decorations.length === 0) { // if no declarations add all
        //   this.variablesDeclarations_2.delete(varName);
        //   continue;
        // }
        let deco = Object.create(decorations);
        deco.color = new Color(value, match.index + spaces, deco.color.alpha, deco.color.rgb);
        colors.push(deco);
      }
      return {line, colors};
    });
    return flattenLineExtractionsFlatten(variables);
  }
  extractVariable(fileName: string, text: string): Color | undefined {
    let match: RegExpMatchArray = text.match(REGEXP_ONE);
    let variable;
    if (match) {
      variable = this.store.findClosestDeclaration(match[2], fileName);
    }
    return variable ? variable.color : undefined;
  }
  variablesCount(): number {
    return this.store.count;
  }
}
VariablesExtractor.registerExtractor(new CssExtractor());
export default CssExtractor;

// ------------------------------------------------------------
// ------------------------------------------------------------
//
// THIS IS VALID
// --val: 20%, 10%, 1
// hsl(var(--val))
// hsla(var(--val), .3)
// TODO
