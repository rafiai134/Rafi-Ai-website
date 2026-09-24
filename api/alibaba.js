export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  return res.status(200).json({
    connected: false,
    status: "Alibaba API connection is waiting for authorization",
    message:
      "Alibaba.com Open Platform authorization is required before live supplier/product data can be accessed."
  });
}
