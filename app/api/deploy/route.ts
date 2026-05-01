import { exec } from "child_process";
import path from "path";

export async function POST() {
  try {
    const generatorPath = path.resolve("../local-site-generator");

    return new Promise<Response>((resolve) => {
      exec("vercel --prod", { cwd: generatorPath }, (error, stdout, stderr) => {
        if (error) {
          console.error(error);

          resolve(
            new Response(
              JSON.stringify({
                success: false,
                error: stderr || error.message,
              }),
              { status: 500 }
            )
          );

          return;
        }

        resolve(
          new Response(
            JSON.stringify({
              success: true,
              output: stdout,
            }),
            { status: 200 }
          )
        );
      });
    });
  } catch (err) {
    return new Response(
      JSON.stringify({
        success: false,
        error: err instanceof Error ? err.message : "Unknown error",
      }),
      { status: 500 }
    );
  }
}