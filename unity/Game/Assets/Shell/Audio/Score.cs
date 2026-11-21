using static System.Math;

namespace Liandan.Sound
{
    public sealed partial class Synth
    {
        private static double Hz(double midi) => 440*Pow(2,(midi-69)/12);
        private void MusicStep(Generation g,Mood c)
        {
            double at=g.Next,beat=c.Beat;
            if (Audit!=null && g.Beat%4==0) Audit.Mark((long)Round(at*rate),"bar",mood);
            var lead=flavor=="soviet"?Wave.Sawtooth:flavor=="cold"?Wave.Square:Wave.Triangle;
            double bright=flavor=="soviet"?Min(c.Bright,1400):flavor=="cold"?Max(c.Bright,2400):c.Bright;
            void Play(double f,double dur,double gain,Wave wave=Wave.Sine,double cutoff=0,double attack=.008,
                double delay=0,double end=0,double second=0,double third=0,int noiseKind=0,Filter filter=Filter.Lowpass)
            {
                var n=Tone(at+delay,f,dur,gain,wave,cutoff==0?c.Bright:cutoff,end,attack);
                n.Owner=g; n.Bus=Bus.Music; n.F2=second; n.F3=third; n.Noise=noiseKind; n.Filter=filter; StartNote(n);
            }
            void CrisisStep()
            {
                int b=g.Beat%16;
                if (g.Beat%8==0)
                {
                    g.Chord=c.Chords[g.Beat/8%c.Chords.Length]; double r=c.Root+g.Chord;
                    Play(Hz(r),beat*8,.07,cutoff:900,attack:.9,second:Hz(r+3),third:Hz(r+6));
                }
                double bass=c.Root+g.Chord-12;
                Play(Hz(bass),.17,.075,Wave.Triangle,320,.005);
                Play(Hz(bass+(b%4==3?13:12)),.15,.05,Wave.Triangle,360,.005,beat/2);
                Play(1,.03,.05,cutoff:6500,delay:beat/2,noiseKind:1,filter:Filter.Highpass);
                if (b%4==0) Play(62,.3,.16,cutoff:200,end:38);
                if (flavor=="soviet" && b%4==2) Play(1,.12,.07,cutoff:1800,noiseKind:1,filter:Filter.Bandpass);
                if (flavor=="cold") Play(1,.02,.03,cutoff:9000,delay:beat/4,noiseKind:1,filter:Filter.Highpass);
                if (flavor=="rose" && b%2==1) Play(1,.07,.035,cutoff:3000,noiseKind:2,filter:Filter.Bandpass);
                if (b==12) Play(Hz(c.Root+24),beat*3,.03,lead,1800,beat*1.5,end:Hz(c.Root+31));
                if (Random()<c.Density) Play(Hz(c.Root+12+c.Scale[(int)(Random()*c.Scale.Length)]),Range(.35,.6),Range(.03,.05),lead,bright);
                g.Next=at+beat;
            }
            if (mood=="crisis") CrisisStep();
            else
            {
                if (g.Beat%8==0)
                {
                    g.Chord=c.Chords[(int)(Random()*c.Chords.Length)]; double root=c.Root+g.Chord;
                    Play(Hz(root),beat*9,.075,attack:1.6,second:Hz(root+(mood=="title"||mood=="triumph"?4:3)),third:Hz(root+7));
                    Play(Hz(root-12),beat*6,mood=="tense"?.085:.05,cutoff:400,attack:.15);
                }
                if (Random()<c.Density)
                {
                    int index=mood=="triumph"?g.Note++%5:mood=="defeat"?4-g.Note++%5:(int)(Random()*5);
                    Play(Hz(c.Root+12+c.Scale[index]),flavor=="rose"?Range(.3,.6):Range(.65,1.5),Range(.025,.055),lead,bright);
                }
                if (mood=="focus")
                {
                    if (g.Beat%2==0) Play(70,.2,.035,cutoff:280);
                    if (flavor=="soviet" && g.Beat%4==2) Play(1,.1,.045,cutoff:1800,noiseKind:1,filter:Filter.Bandpass);
                    if (flavor=="rose" && g.Beat%2==1) Play(1,.06,.03,cutoff:3200,noiseKind:2,filter:Filter.Bandpass);
                    if (flavor=="cold") Play(1,.02,.025,cutoff:9000,delay:beat/2,noiseKind:1,filter:Filter.Highpass);
                }
                g.Next=at+beat*Range(.97,1.03);
            }
            g.Beat++;
        }
    }
}
