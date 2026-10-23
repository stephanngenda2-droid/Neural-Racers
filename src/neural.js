// Small feed-forward neural network. Inputs are seven normalized sensor distances.
export class NeuralNetwork {
  constructor(sizes=[7,10,3], params=null) {
    this.sizes=sizes.slice();
    this.weights=[]; this.biases=[];
    for(let l=0;l<sizes.length-1;l++){
      const rows=sizes[l+1], cols=sizes[l];
      this.weights.push(params?.weights?.[l]?.map(r=>r.slice()) || Array.from({length:rows},()=>Array.from({length:cols},()=>randn()*0.8)));
      this.biases.push(params?.biases?.[l]?.slice() || Array.from({length:rows},()=>randn()*0.25));
    }
  }
  forward(input){
    let a=input.slice();
    for(let l=0;l<this.weights.length;l++){
      const next=this.weights[l].map((row,i)=>Math.tanh(row.reduce((s,w,j)=>s+w*(a[j]||0),this.biases[l][i])));
      a=next;
    }
    return a;
  }
  clone(){return new NeuralNetwork(this.sizes,{weights:this.weights,biases:this.biases});}
  mutate(rate=.12,strength=.35){
    for(let l=0;l<this.weights.length;l++){
      for(let i=0;i<this.weights[l].length;i++){
        for(let j=0;j<this.weights[l][i].length;j++) if(Math.random()<rate)this.weights[l][i][j]+=randn()*strength;
        if(Math.random()<rate)this.biases[l][i]+=randn()*strength;
      }
    }
  }
  toJSON(){return {sizes:this.sizes,weights:this.weights,biases:this.biases};}
  static fromJSON(obj){if(!obj||!Array.isArray(obj.sizes)||obj.sizes[0]!==7||obj.sizes.at(-1)!==3)throw Error('Invalid model architecture');return new NeuralNetwork(obj.sizes,obj);}
}
function randn(){let u=0,v=0;while(!u)u=Math.random();while(!v)v=Math.random();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v)}