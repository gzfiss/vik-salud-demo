/* Small byte-mode QR encoder for this demo: version 8, level L, mask 0.
   Local implementation; no network or external QR service. Max 192 UTF-8 bytes. */
(() => {
  function matrix(text) {
    const bytes=Array.from(new TextEncoder().encode(text));if(bytes.length>192)throw Error('El enlace es demasiado largo para el QR de demostración.');
    const bits=[];const put=(n,size)=>{for(let i=size-1;i>=0;i--)bits.push((n>>>i)&1);};
    put(4,4);put(bytes.length,8);bytes.forEach(b=>put(b,8));put(0,Math.min(4,1552-bits.length));while(bits.length%8)bits.push(0);
    const data=[];for(let i=0;i<bits.length;i+=8)data.push(bits.slice(i,i+8).reduce((a,b)=>(a<<1)|b,0));for(let i=0;data.length<194;i++)data.push(i%2?0x11:0xec);
    const exp=new Array(512),log=new Array(256);let x=1;for(let i=0;i<255;i++){exp[i]=x;log[x]=i;x<<=1;if(x&256)x^=0x11d;}for(let i=255;i<512;i++)exp[i]=exp[i-255];const mul=(a,b)=>a&&b?exp[log[a]+log[b]]:0;
    let gen=[1];for(let i=0;i<24;i++){const next=new Array(gen.length+1).fill(0);gen.forEach((g,j)=>{next[j]^=g;next[j+1]^=mul(g,exp[i]);});gen=next;}
    const blocks=[data.slice(0,97),data.slice(97)];const ecc=blocks.map(b=>{const rem=[...b,...new Array(24).fill(0)];for(let i=0;i<b.length;i++){const v=rem[i];for(let j=0;j<gen.length;j++)rem[i+j]^=mul(v,gen[j]);}return rem.slice(-24);});
    const words=[];for(let i=0;i<97;i++)for(let j=0;j<2;j++)words.push(blocks[j][i]);for(let i=0;i<24;i++)for(let j=0;j<2;j++)words.push(ecc[j][i]);
    const n=49,m=Array.from({length:n},()=>new Array(n).fill(null));
    function finder(row,col){for(let r=-1;r<=7;r++)for(let c=-1;c<=7;c++){if(row+r<0||row+r>=n||col+c<0||col+c>=n)continue;m[row+r][col+c]=r>=0&&r<=6&&c>=0&&c<=6&&(r===0||r===6||c===0||c===6||(r>=2&&r<=4&&c>=2&&c<=4));}}
    finder(0,0);finder(n-7,0);finder(0,n-7);
    for(const r of [6,24,42])for(const c of [6,24,42]){if(m[r][c]!==null)continue;for(let dr=-2;dr<=2;dr++)for(let dc=-2;dc<=2;dc++)m[r+dr][c+dc]=Math.max(Math.abs(dr),Math.abs(dc))!==1;}
    for(let i=8;i<n-8;i++){if(m[i][6]===null)m[i][6]=i%2===0;if(m[6][i]===null)m[6][i]=i%2===0;}
    const bch=(v,poly,shift)=>{let a=v<<shift;const degree=v=>31-Math.clz32(v);while(degree(a)>=degree(poly))a^=poly<<(degree(a)-degree(poly));return (v<<shift)|a;};
    const format=bch(8,0x537,10)^0x5412;
    for(let i=0;i<15;i++){const b=((format>>>i)&1)===1;if(i<6)m[i][8]=b;else if(i<8)m[i+1][8]=b;else m[n-15+i][8]=b;if(i<8)m[8][n-i-1]=b;else if(i<9)m[8][15-i]=b;else m[8][15-i-1]=b;}
    m[n-8][8]=true;const version=bch(8,0x1f25,12);for(let i=0;i<18;i++){const b=((version>>>i)&1)===1;m[Math.floor(i/3)][i%3+n-11]=b;m[i%3+n-11][Math.floor(i/3)]=b;}
    let row=n-1,inc=-1,bit=0;for(let col=n-1;col>0;col-=2){if(col===6)col--;for(;;){for(let c=0;c<2;c++){const cc=col-c;if(m[row][cc]===null){const v=bit<words.length*8?(words[bit>>>3]>>>(7-bit%8))&1:0;bit++;m[row][cc]=Boolean(v^((row+cc)%2===0?1:0));}}row+=inc;if(row<0||row>=n){row-=inc;inc=-inc;break;}}}
    return m;
  }
  function QRCode(el,opts){if(typeof el==='string')el=document.getElementById(el);const m=matrix(typeof opts==='string'?opts:opts.text);const path=[];m.forEach((row,r)=>row.forEach((v,c)=>{if(v)path.push(`M${c+4},${r+4}h1v1h-1z`);}));const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 57 57"><rect width="57" height="57" fill="white"/><path d="${path.join('')}" fill="#302a43"/></svg>`;const image=document.createElement('img');image.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);image.alt='QR de emergencia de demostración';image.width=opts.width||220;image.height=opts.height||220;el.replaceChildren(image);this.clear=()=>el.replaceChildren();}
  QRCode.CorrectLevel={L:1,M:0};QRCode.matrix=matrix;window.QRCode=QRCode;
})();
