/** Cursivas explícitas en enunciados docentes, sin HTML ni formato oculto.
 * Una pareja de asteriscos alrededor de texto marca cursiva y se conserva
 * íntegra en NotebookEditionV1 para edición reversible.
 */
export interface InlineTextSegmentV1 {text:string;italic:boolean}
export function splitInlineItalics(input:string):InlineTextSegmentV1[]{
  const output:InlineTextSegmentV1[]=[];
  const pattern=/\*([^*\n]+)\*/gu;
  let pos=0,match:RegExpExecArray|null;
  while((match=pattern.exec(input))!==null){
    if(match.index>pos)output.push({text:input.slice(pos,match.index),italic:false});
    output.push({text:match[1]!,italic:true});
    pos=match.index+match[0].length;
  }
  if(pos<input.length)output.push({text:input.slice(pos),italic:false});
  return output;
}
