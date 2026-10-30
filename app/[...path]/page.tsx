import Game from "../ui";
export default async function Page({
  params,
}: {
  params: Promise<{ path: string[] }>;
}) {
  const { path } = await params;
  return (
    <Game
      view={
        path[0] === "profile" && path[1] === "edit" ? "profile-edit" : path[0]
      }
    />
  );
}
