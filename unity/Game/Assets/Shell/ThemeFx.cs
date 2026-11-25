#nullable enable
using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UIElements;
using Random = System.Random;

namespace Liandan.Shell
{
    // 只拥有过场文档及传入的截图；既不持有游戏状态，也不参与界面命中测试。
    internal sealed class ThemeFx
    {
        private const float Tau = 2 * Mathf.PI;
        private const int Sides = 180, Seed = 37193;
        private readonly UIDocument main;
        private GameObject? overlay;
        private VisualElement canvas = null!;
        private Texture2D? shot;
        private string kind = "";
        private float width, height, diagonal, dx, dy, time, start, duration, tail, worst;
        private int cols, rows, frames;
        private bool pinned, skipFrame;
        internal bool Playing => shot != null;
        internal float Total => duration + tail;
        internal float PaintedTime { get; private set; } = -1;

        private readonly Vector2[] rays = new Vector2[Sides];
        private readonly float[] radius = new float[Sides], phases = new float[6];
        private readonly List<Strip> strips = new List<Strip>();
        private float[] mask = Array.Empty<float>(), jitter = Array.Empty<float>();
        private readonly List<Vine> vines = new List<Vine>();
        private readonly List<Spark> sparks = new List<Spark>(640);
        private readonly Tongue[] tongues = new Tongue[70];
        private readonly Fragment[] fragments = new Fragment[58];
        private Random random = new Random(Seed);
        private struct Spark { internal Vector2 pos, velocity; internal float size, life; }
        private struct Tongue { internal Vector2 from, control, to; internal Color color; internal float width; }
        private struct Fragment { internal Rect rect; internal Color color; }
        private sealed class Vine { internal Vector3[] pts = null!; internal int depth, grown; internal bool rose; }

        internal ThemeFx(UIDocument main){this.main=main;for(int index=0;index<Sides;index++)rays[index]=Direction(index*Tau/Sides);}
        private static Vector2 Direction(float angle)=>new Vector2(Mathf.Cos(angle),Mathf.Sin(angle));
        private float Rand()=>(float)random.NextDouble();
        private static Color Ink(int red,int green,int blue,float alpha=1)=>new Color(red/255f,green/255f,blue/255f,alpha);
        private static Color Faded(Color color,float fade){color.a*=fade;return color;}
        private static void Cover(VisualElement element){
            element.pickingMode=PickingMode.Ignore;element.style.position=Position.Absolute;
            element.style.left=element.style.right=element.style.top=element.style.bottom=0;
        }
        internal void Play(string kind,Texture2D oldShot){
            Stop();this.kind=kind;shot=oldShot;
            (duration,tail)=kind switch { "burn"=>(2.7f,.7f),"frost"=>(1.9f,.5f),"bloom"=>(3.1f,.8f),_=>throw new ArgumentOutOfRangeException(nameof(kind)) };
            overlay=new GameObject("Theme FX");overlay.SetActive(false);overlay.transform.SetParent(main.transform.parent,false);
            var doc=overlay.AddComponent<UIDocument>();doc.panelSettings=main.panelSettings;doc.sortingOrder=main.sortingOrder+1;
            overlay.SetActive(true);Cover(doc.rootVisualElement);
            canvas=new VisualElement();Cover(canvas);doc.rootVisualElement.Add(canvas);canvas.generateVisualContent+=Paint;
            start=Time.unscaledTime;worst=0;frames=0;skipFrame=true;pinned=false;
            Resize();Step(0,0);
        }
        private void Resize(){
            var rect=main.rootVisualElement.layout;width=Mathf.Max(1,rect.width);height=Mathf.Max(1,rect.height);
            diagonal=new Vector2(width,height).magnitude;
            cols=Math.Max(1,(Screen.width+15)/16);rows=Math.Max(1,(Screen.height+15)/16);dx=width/cols;dy=height/rows;
            mask=new float[(cols+1)*(rows+1)];jitter=new float[cols/2+1];strips.Clear();
            int band=65535/(cols+1)-1;
            for(int first=0;first<rows;first+=band)strips.Add(new Strip(first,Math.Min(rows-first,band),cols,rows,width,height,kind=="burn"));
            random=new Random(Seed);vines.Clear();
            if(kind=="burn")for(int index=0;index<phases.Length;index++)phases[index]=Rand()*Tau;
            if(kind=="bloom")for(int index=0;index<12;index++)Grow(width*.5f,height*.5f,index/10f*Tau+Rand()*.4f,.15f+Rand()*.15f,0,Mathf.CeilToInt(diagonal*.56f/16)+4);
            ResetSimulation();
        }
        private void ResetSimulation(){random=new Random(Seed+1);sparks.Clear();Array.Clear(jitter,0,jitter.Length);time=0;}
        internal void Pin(float seconds){
            if(!Playing)return;
            pinned=true;PaintedTime=-1;Replay(Mathf.Clamp(seconds,0,Total));canvas.MarkDirtyRepaint();
        }
        private void Replay(float seconds){
            ResetSimulation();Step(0,0);
            for(int frame=1;frame/60f<=seconds;frame++)Step(frame/60f,1/60f);
            if(time<seconds)Step(seconds,seconds-time);
        }
        internal void Tick(){
            if(!Playing)return;
            var rect=main.rootVisualElement.layout;
            if(width!=rect.width || height!=rect.height || cols!=(Screen.width+15)/16 || rows!=(Screen.height+15)/16){
                float previous=time;Resize();Replay(previous);canvas.MarkDirtyRepaint();
            }
            if(pinned)return;
            float now=Time.unscaledTime-start;
            if(skipFrame)skipFrame=false;else {worst=Mathf.Max(worst,Time.unscaledDeltaTime);frames++;}
            if(now>=Total){Debug.Log($"Liandan theme fx {kind}: worst frame {worst*1000:F1} ms over {frames} frames");Stop();return;}
            Step(now,Mathf.Clamp(now-time,0,.05f));canvas.MarkDirtyRepaint();
        }
        internal void Stop(){
            if(overlay!=null){canvas.generateVisualContent-=Paint;canvas.RemoveFromHierarchy();overlay.SetActive(false);UnityEngine.Object.Destroy(overlay);overlay=null;}
            if(shot!=null)UnityEngine.Object.Destroy(shot);
            shot=null;canvas=null!;strips.Clear();vines.Clear();sparks.Clear();mask=jitter=Array.Empty<float>();
        }

        // 相邻条带共用一行的坐标与遮罩值，但各自从零编号以满足 16 位索引限制。
        private sealed class Strip
        {
            internal readonly Vertex[] vertices;
            internal readonly ushort[] indices;
            internal readonly Vector2[] polar;
            internal readonly int offset;
            internal Strip(int first,int count,int cols,int rows,float width,float height,bool burn){
                int stride=cols+1;offset=first*stride;
                vertices=new Vertex[(count+1)*stride];indices=new ushort[count*cols*6];polar=burn?new Vector2[vertices.Length]:Array.Empty<Vector2>();
                for(int row=0,idx=0;row<=count;row++)for(int col=0;col<=cols;col++){
                    int at=row*stride+col;float u=col/(float)cols,v=(first+row)/(float)rows;
                    var pos=new Vector2(u*width,v*height);
                    // UI 的 y 向下，截图的纹理 v 向上。截图位置不使用 URP 的 renderScale。
                    vertices[at]=new Vertex{position=new Vector3(pos.x,pos.y,Vertex.nearZ),uv=new Vector2(u,1-v),tint=Color.white};
                    if(burn){var delta=pos-new Vector2(width*.5f,height*.47f);polar[at]=new Vector2(Mathf.Repeat(Mathf.Atan2(delta.y,delta.x)/Tau*Sides,Sides),delta.magnitude);}
                    if(row==count || col==cols)continue;
                    indices[idx++]=(ushort)at;indices[idx++]=(ushort)(at+1);indices[idx++]=(ushort)(at+stride);
                    indices[idx++]=(ushort)(at+1);indices[idx++]=(ushort)(at+stride+1);indices[idx++]=(ushort)(at+stride);
                }
            }
        }
        private float ScanY(){float progress=Mathf.Min(1,time/duration);return -60+(height+120)*(progress<.5f?2*progress*progress:1-2*(1-progress)*(1-progress));}
        private void Paint(MeshGenerationContext ctx){
            if(!Playing)return;
            // 淡出段不再提交截图网格，边角也绝不残留旧主题。
            if(time<duration){
                float soft=(dx+dy)*.5f,scan=ScanY();
                if(kind=="bloom")BloomMask(soft);
                foreach(var strip in strips){
                    for(int index=0;index<strip.vertices.Length;index++){
                        ref var vertex=ref strip.vertices[index];int at=strip.offset+index;
                        if(kind=="burn"){
                            var polar=strip.polar[index];int side=(int)polar.x%Sides;
                            float edge=Mathf.Lerp(radius[side],radius[(side+1)%Sides],polar.x-(int)polar.x);
                            mask[at]=Mathf.Clamp01(.5f+(polar.y-edge)/soft);
                        }else if(kind=="frost")mask[at]=Mathf.Clamp01(.5f+(vertex.position.y-scan-jitter[(at%(cols+1))/2])/dy);
                        vertex.tint.a=(byte)Mathf.RoundToInt(mask[at]*255);
                    }
                    var mesh=ctx.Allocate(strip.vertices.Length,strip.indices.Length,shot);mesh.SetAllVertices(strip.vertices);mesh.SetAllIndices(strip.indices);
                }
            }
            float fade=Mathf.Clamp01(1-(time-duration)/tail);
            if(kind=="burn")Burn(ctx.painter2D,fade);else if(kind=="frost")Frost(ctx,fade);else Bloom(ctx.painter2D,fade);
            PaintedTime=time;
        }
        private void Step(float seconds,float dt){
            time=seconds;
            if(kind=="burn")StepBurn(dt);
            else if(kind=="frost")StepFrost();
            else foreach(var vine in vines){int grown=0;while(grown<vine.pts.Length && vine.pts[grown].z<=time)grown++;vine.grown=grown;}
        }

        private Vector2 FireCenter=>new Vector2(width*.5f,height*.47f);
        private Vector2 Edge(int side,float extra=0)=>FireCenter+rays[side]*(radius[side]+extra);
        private void StepBurn(float dt){
            float size=Mathf.Max(2,diagonal*.58f*Mathf.Pow(Mathf.Min(1,time/duration),1.6f)*1.04f);
            for(int side=0;side<Sides;side++){
                float angle=side*Tau/Sides;
                radius[side]=size*(1+.1f*Mathf.Sin(3*angle+phases[0]+time*1.7f)+.06f*Mathf.Sin(7*angle+phases[1]-time*2.9f)
                    +.035f*Mathf.Sin(13*angle+phases[2]+time*4.3f)+.02f*Mathf.Sin(29*angle+phases[3]-time*6));
            }
            for(int index=0;index<tongues.Length;index++){
                int side=random.Next(Sides);var from=Edge(side);var dir=Direction(side*Tau/Sides+(Rand()-.5f)*.5f);float length=10+Rand()*34;
                tongues[index]=new Tongue{from=from,control=from+dir*(length*.6f)+new Vector2((Rand()-.5f)*10,-length*.3f),to=from+dir*length+new Vector2(0,-length*.5f),
                    color=Ink(255,120+random.Next(100),30,.25f+Rand()*.4f),width=2+Rand()*4};
            }
            if(time<duration)for(int index=0;index<9;index++){
                int side=random.Next(Sides);sparks.Add(new Spark{pos=Edge(side),velocity=rays[side]*(40+Rand()*120)+new Vector2(0,-60),life=1,size=1+Rand()*2.2f});
            }
            int alive=0;for(int index=0;index<sparks.Count;index++){
                var spark=sparks[index];spark.pos+=spark.velocity*dt;spark.velocity.y-=90*dt;spark.life-=dt*.9f;
                if(spark.life>0)sparks[alive++]=spark;
            }
            sparks.RemoveRange(alive,sparks.Count-alive);
        }
        private void Ring(Painter2D pen,float extra,float thickness,Color color){
            pen.strokeColor=color;pen.lineWidth=thickness;pen.BeginPath();pen.MoveTo(Edge(0,extra));
            for(int index=1;index<Sides;index++)pen.LineTo(Edge(index,extra));pen.ClosePath();pen.Stroke();
        }
        private static void Disc(Painter2D pen,Vector2 pos,float size,Color color){
            if(size<=0)return;pen.fillColor=color;pen.BeginPath();pen.Arc(pos,size,0,360);pen.ClosePath();pen.Fill();
        }
        private void Burn(Painter2D pen,float fade){
            pen.lineJoin=LineJoin.Round;pen.lineCap=LineCap.Round;
            Ring(pen,16,42,Ink(28,12,4,.12f*fade));Ring(pen,16,36,Ink(28,12,4,.22f*fade));Ring(pen,16,30,Ink(28,12,4,.62f*fade));
            Ring(pen,0,54,Ink(255,90,0,.08f*fade));Ring(pen,0,34,Ink(255,90,0,.18f*fade));Ring(pen,0,18,Ink(255,96,16,.5f*fade));
            Ring(pen,0,6,Ink(255,190,70,.9f*fade));Ring(pen,0,2,Ink(255,248,220,.95f*fade));
            foreach(var tongue in tongues){pen.strokeColor=Faded(tongue.color,fade);pen.lineWidth=tongue.width;pen.BeginPath();pen.MoveTo(tongue.from);pen.QuadraticCurveTo(tongue.control,tongue.to);pen.Stroke();}
            // 同一帧出生的火星颜色、寿命完全相同，合为一次填充，不为每颗都提交一笔。
            float life=-1;
            foreach(var spark in sparks){
                if(spark.life!=life){if(life>=0)pen.Fill();life=spark.life;pen.fillColor=Ink(255,170+(int)(life*80),80,life*fade);pen.BeginPath();}
                pen.MoveTo(spark.pos+new Vector2(spark.size,0));pen.Arc(spark.pos,spark.size,0,360);pen.ClosePath();
            }
            if(life>=0)pen.Fill();
        }

        private void StepFrost(){
            // 网页的抖动单位是一格 8 逻辑像素的遮罩，而不是一格截图网格。
            for(int group=0;group<jitter.Length;group++)if(Rand()<.25f)jitter[group]=(Rand()-.35f)*5*height/Mathf.Max(18,Mathf.Ceil(height/8));
            float scan=ScanY();
            for(int index=0;index<fragments.Length;index++){
                if(index<18)fragments[index]=new Fragment{rect=new Rect(Rand()*width,scan+(Rand()-.75f)*90,16+Rand()*220,2+Rand()*7),
                    color=Rand()<.5f?Ink(110,215,255,.32f):Ink(255,255,255,.22f)};
                else fragments[index]=new Fragment{rect=new Rect(Mathf.Floor(Rand()*width/12)*12,scan-Rand()*120,3,6),color=Ink(160,230,255,.5f)};
            }
        }
        private static Vertex Corner(float left,float top,Color color)=>new Vertex{position=new Vector3(left,top,Vertex.nearZ),tint=color};
        private static readonly ushort[] QuadIndices={0,1,2,0,2,3};
        private void Gradient(MeshGenerationContext ctx,float top,float bottom,Color upper,Color lower){
            var mesh=ctx.Allocate(4,6);mesh.SetNextVertex(Corner(0,top,upper));mesh.SetNextVertex(Corner(width,top,upper));
            mesh.SetNextVertex(Corner(width,bottom,lower));mesh.SetNextVertex(Corner(0,bottom,lower));mesh.SetAllIndices(QuadIndices);
        }
        private static void Segment(Painter2D pen,float left,float top,float right,float bottom){pen.MoveTo(new Vector2(left,top));pen.LineTo(new Vector2(right,bottom));}
        private void Frost(MeshGenerationContext ctx,float fade){
            var pen=ctx.painter2D;float scan=ScanY();pen.lineWidth=1;
            for(int band=0;band<10;band++){
                float top=scan-260+band*26,bottom=top+26;if(bottom<0 || top>height)continue;
                pen.strokeColor=Ink(90,209,255,.32f*(band+.5f)/10*fade);pen.BeginPath();
                for(float left=.5f;left<=width;left+=24)Segment(pen,left,top,left,bottom);
                for(float line=Mathf.Ceil(top/24)*24;line<bottom;line+=24)Segment(pen,0,line+.5f,width,line+.5f);
                pen.Stroke();
            }
            var mid=Ink(110,215,255,.45f*fade);
            Gradient(ctx,scan-46,scan-7,Ink(90,209,255,0),mid);Gradient(ctx,scan-7,scan+6,mid,Ink(235,250,255,.95f*fade));
            Gradient(ctx,scan-1,scan+1,Ink(255,255,255,.9f*fade),Ink(255,255,255,.9f*fade));
            foreach(var fragment in fragments){
                var rect=fragment.rect;pen.fillColor=Faded(fragment.color,fade);pen.BeginPath();pen.MoveTo(rect.min);pen.LineTo(new Vector2(rect.xMax,rect.y));
                pen.LineTo(rect.max);pen.LineTo(new Vector2(rect.x,rect.yMax));pen.ClosePath();pen.Fill();
            }
        }

        private void Grow(float left,float top,float angle,float born,int depth,int steps){
            var vine=new Vine{pts=new Vector3[steps+1],depth=depth,rose=depth==0 || Rand()<.55f};vine.pts[0]=new Vector3(left,top,born);
            for(int index=0;index<steps;index++){
                angle+=(Rand()-.5f)*.42f+Mathf.Sin(index*.37f+depth)*.05f;var delta=Direction(angle)*(13+Rand()*7);
                left+=delta.x;top+=delta.y;born+=.02f+Rand()*.012f;vine.pts[index+1]=new Vector3(left,top,born);
                if(depth<2 && index>3 && Rand()<.11f)Grow(left,top,angle+(Rand()<.5f?1:-1)*(.6f+Rand()*.7f),born,depth+1,(int)((steps-index)*.55f));
            }
            vines.Add(vine);
        }
        private void BloomMask(float soft){
            Array.Fill(mask,1f);
            CutCircle(width*.5f,height*.5f,Mathf.Pow(Mathf.Max(0,(time-.2f)/duration),1.5f)*diagonal*.56f*1.05f,soft);
            foreach(var vine in vines)for(int index=0;index<vine.grown;index+=2){var pt=vine.pts[index];CutCircle(pt.x,pt.y,Mathf.Min(120,(time-pt.z)*150),soft);}
        }
        private void CutCircle(float left,float top,float size,float soft){
            if(size<=0)return;
            float outer=size+soft*.5f,inner=Mathf.Max(0,size-soft*.5f);
            int firstCol=Math.Max(0,Mathf.CeilToInt((left-outer)/dx)),lastCol=Math.Min(cols,Mathf.FloorToInt((left+outer)/dx));
            int firstRow=Math.Max(0,Mathf.CeilToInt((top-outer)/dy)),lastRow=Math.Min(rows,Mathf.FloorToInt((top+outer)/dy));
            for(int row=firstRow;row<=lastRow;row++){
                float offsetY=row*dy-top,ysq=offsetY*offsetY;int startAt=row*(cols+1);
                for(int col=firstCol;col<=lastCol;col++){
                    int at=startAt+col;if(mask[at]==0)continue;float offsetX=col*dx-left,dist=offsetX*offsetX+ysq;
                    if(dist<=inner*inner)mask[at]=0;else if(dist<outer*outer)mask[at]=Mathf.Min(mask[at],.5f+(Mathf.Sqrt(dist)-size)/soft);
                }
            }
        }
        private static void Branch(Painter2D pen,Vector3[] points,int from,int to,float thickness,Color color){
            pen.strokeColor=color;pen.lineWidth=thickness;pen.BeginPath();pen.MoveTo(points[from]);
            for(int index=from+1;index<to;index++)pen.LineTo(points[index]);pen.Stroke();
        }
        private static readonly Vector2[] LeafShape=MakeLeaf();
        private static Vector2[] MakeLeaf(){
            var shape=new Vector2[12];for(int index=0;index<shape.Length;index++)shape[index]=Direction(index*Tau/shape.Length);return shape;
        }
        private void Bloom(Painter2D pen,float fade){
            pen.lineCap=LineCap.Round;pen.lineJoin=LineJoin.Round;
            foreach(var vine in vines)for(int third=0;third<3;third++){
                int length=vine.pts.Length,from=third*length/3,to=Math.Min(vine.grown,(third+1)*length/3+1);if(to-from<2)continue;
                float thickness=Mathf.Max(1.6f,(vine.depth>0?4:7.5f)*(1-third*.3f));
                Branch(pen,vine.pts,from,to,thickness+8,Ink(120,220,140,.18f*fade));
                Branch(pen,vine.pts,from,to,thickness,vine.depth>0?Ink(63,143,90,fade):Ink(47,122,82,fade));
            }
            foreach(var vine in vines){
                for(int first=3;first<=6 && first<vine.grown;first+=3){
                    // 网页按 i%3 选色，但叶子下标都是 3 的倍数，实际只用到 #3f8f5a。
                    pen.fillColor=Ink(63,143,90,fade);pen.BeginPath();
                    for(int index=first;index<vine.grown;index+=6){
                        var pt=vine.pts[index];var prev=vine.pts[index-1];float scale=Mathf.Min(1,(time-pt.z)*3);if(scale<=0)continue;
                        var axis=Direction(Mathf.Atan2(pt.y-prev.y,pt.x-prev.x)+(first==3?1:-1)*1.1f)*scale;
                        var side=new Vector2(-axis.y,axis.x)*4.8f;var center=(Vector2)pt+axis*8;
                        for(int point=0;point<LeafShape.Length;point++){
                            var unit=LeafShape[point];var pos=center+axis*(11*unit.x)+side*unit.y;if(point==0)pen.MoveTo(pos);else pen.LineTo(pos);
                        }
                        pen.ClosePath();
                    }
                    pen.Fill(FillRule.NonZero);
                }
            }
            foreach(var vine in vines){
                var tip=vine.pts[vine.pts.Length-1];if(!vine.rose || time<=tip.z)continue;
                float size=(vine.depth>0?10:15)*Mathf.Min(1,(time-tip.z)*2.2f);
                Disc(pen,tip,size*1.4f,Ink(255,80,110,.18f*fade));
                for(int layer=0;layer<2;layer++){
                    float scale=layer==0?1:.62f;var color=layer==0?Ink(224,67,94,fade):Ink(194,45,74,fade);
                    for(int petal=0;petal<5;petal++)Disc(pen,(Vector2)tip+Direction(petal*Tau/5+tip.z*3+scale)*(size*.55f*scale),size*.6f*scale,color);
                }
                Disc(pen,tip,size*.26f,Ink(125,26,46,fade));
            }
        }
    }
}
