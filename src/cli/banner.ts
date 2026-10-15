import pc from 'picocolors';

export function printBanner(): void {
  console.log(
    pc.cyan(`
   _____ __                               __                      
  / ___// /_________  ____ _____ ___     / /   ___  ____  _____   
  \\__ \\/ __/ ___/ _ \\/ __ \`/ __ \`__ \\   / /   / _ \\/ __ \\/ ___/   
 ___/ / /_/ /  /  __/ /_/ / / / / / /  / /___/  __/ / / (__  )    
/____/\\__/_/   \\___/\\__,_/_/ /_/ /_/  /_____/\\___/_/ /_/____/     
    `)
  );
  console.log(
    pc.dim('  Server-Sent Events (SSE) & LLM Token Stream Inspector v0.1.0\n')
  );
}
