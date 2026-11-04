// Atalho da raiz da pasta: abre o jogo em app\ usando caminho relativo,
// para continuar funcionando se a pasta Enem mudar de lugar.
using System;
using System.Diagnostics;
using System.IO;
using System.Windows.Forms;

class Jogar
{
    [STAThread]
    static void Main()
    {
        string raiz = AppDomain.CurrentDomain.BaseDirectory;
        string exe = Path.Combine(raiz, "app", "ENEM RPG.exe");
        if (!File.Exists(exe))
        {
            MessageBox.Show("Não encontrei a pasta \"app\" ao lado deste arquivo.", "ENEM RPG");
            return;
        }
        ProcessStartInfo inicio = new ProcessStartInfo(exe);
        inicio.WorkingDirectory = Path.Combine(raiz, "app");
        inicio.UseShellExecute = false;
        Process.Start(inicio);
    }
}
